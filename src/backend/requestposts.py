from flask import request, jsonify
import mysql.connector
from app import app, db_config, get_user_id_from_session


# New helper function to sort tweets in a conversation chain
def sort_tweets_by_conversation(tweets):
    """
    Build a conversation chain from the provided tweets by:
      1. Grouping tweets by ParentID.
      2. Selecting the root tweet (ParentID is NULL) with the latest CreatedAt (tie-breaker: highest ID).
      3. Iteratively picking the child tweet with the latest CreatedAt (tie-breaker: highest ID).
      4. Preventing cycles by tracking visited tweet IDs.
    """
    children_map = {}
    for tweet in tweets:
        parent = tweet.get("ParentID")
        children_map.setdefault(parent, []).append(tweet)
    
    def select_child(children):
        return max(children, key=lambda x: (x["CreatedAt"], x["ID"])) if children else None

    roots = children_map.get(None, [])
    if not roots:
        return tweets
    current = select_child(roots)
    sorted_chain = []
    visited = set()
    while current and current["ID"] not in visited:
        sorted_chain.append(current)
        visited.add(current["ID"])
        children = children_map.get(current["ID"], [])
        current = select_child(children)
    return sorted_chain

@app.route('/api/app/requestposts', methods=['GET'])
def get_posts_by_session():
    # Get session ID from request args (if provided) or fall back to the cookie
    user_session_id = request.args.get('session_id') or request.cookies.get('user_session_id')
    # Get chat_id or chat_url parameter
    chat_id = request.args.get('chat_id', type=int)
    chat_url = request.args.get('chat_url')

    connection = None
    cursor = None

    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)

        # If chat_url is provided, get the corresponding chat_id
        if chat_url:
            query = "SELECT ChatID FROM Content WHERE ChatURL = %s LIMIT 1"
            cursor.execute(query, (chat_url,))
            result = cursor.fetchone()
            if result:
                chat_id = result['ChatID']
            else:
                return jsonify({'error': 'Chat not found'}), 404

        # If chat_id was not provided in the request, get the next available chat_id
        if not chat_id:
            if user_session_id:
                user_id = get_user_id_from_session(user_session_id)
                if user_id:
                    # Get highest chat_id for this user
                    query = "SELECT MAX(ChatID) as max_id FROM Content WHERE UserID = %s"
                    cursor.execute(query, (user_id,))
            else:
                cookie_id = request.cookies.get('saves_your_work')
                if cookie_id:
                    # Get highest chat_id for this cookie
                    query = "SELECT MAX(ChatID) as max_id FROM Content WHERE CookieID = %s"
                    cursor.execute(query, (cookie_id,))
                else:
                    # Fallback query if no user or cookie ID
                    query = "SELECT 1 as max_id"
                    cursor.execute(query)
            
            result = cursor.fetchone()
            chat_id = (result['max_id'] or 0) + 1

        # Now, try to fetch posts for the determined chat_id
        if user_session_id:
            user_id = get_user_id_from_session(user_session_id)
            if user_id:
                query = """
                SELECT ID, ChatID, Input, Response, CreatedAt, ParentID, OriginalID, Version,
                       ChatURL,
                       (SELECT COUNT(*) FROM Content AS t2 WHERE t2.OriginalID = Content.OriginalID) as TotalVersions
                FROM Content 
                WHERE UserID = %s AND ChatID = %s AND Closed = 0
                AND ChatID IS NOT NULL
                """
                cursor.execute(query, (user_id, chat_id))
                posts = cursor.fetchall()
                posts = sort_tweets_by_conversation(posts)
                return jsonify({'user_id': user_id, 'chat_id': chat_id, 'posts': posts}), 200

        cookie_id = request.cookies.get('saves_your_work')
        if cookie_id:
            query = """
            SELECT ID, ChatID, Input, Response, CreatedAt, ParentID, OriginalID, Version,
                   ChatURL,
                   (SELECT COUNT(*) FROM Content AS t2 WHERE t2.OriginalID = Content.OriginalID) as TotalVersions
            FROM Content 
            WHERE CookieID = %s AND ChatID = %s AND Closed = 0
            AND ChatID IS NOT NULL
            """
            cursor.execute(query, (cookie_id, chat_id))
            posts = cursor.fetchall()
            posts = sort_tweets_by_conversation(posts)
            return jsonify({'user_id': None, 'chat_id': chat_id, 'posts': posts}), 200

        return jsonify({'error': 'No valid session or cookie found'}), 401

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'error': 'Failed to retrieve data'}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

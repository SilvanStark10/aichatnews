from flask import request, jsonify
import mysql.connector
import json
import datetime
from app import app, db_config, get_user_id_from_session

def get_child_chain(tweets, tweet_id):
    """
    Locate the tweet with the given tweet_id in the provided list of tweets.
    Then follow its child chain downward until a tweet with no child is found.
    Returns a list of child IDs.
    
    Note: This function assumes that the conversation is linear. If there are multiple
    children for a given tweet, it picks the one with the earliest CreatedAt timestamp.
    """
    # Build a mapping from ParentID to its child tweet.
    children_map = {}
    for tweet in tweets:
        parent_id = tweet.get("ParentID")
        if parent_id is not None:
            # If multiple tweets have the same ParentID, choose the one with the earliest CreatedAt.
            if parent_id not in children_map:
                children_map[parent_id] = tweet
            else:
                if tweet["CreatedAt"] < children_map[parent_id]["CreatedAt"]:
                    children_map[parent_id] = tweet

    # Start from the given tweet_id and follow the chain of children.
    chain = []
    visited = set()
    current_id = tweet_id
    while current_id in children_map:
        child_tweet = children_map[current_id]
        child_id = child_tweet["ID"]
        if child_id in visited:
            break  # Prevent cycles.
        chain.append(child_id)
        visited.add(child_id)
        current_id = child_id
    return chain

@app.route('/api/app/editpost', methods=['GET'])
def get_editpost():
    # Retrieve parameters from the request.
    user_session_id = request.args.get('session_id') or request.cookies.get('user_session_id')
    chat_id = request.args.get('chat_id', type=int)
    tweet_id = request.args.get('id', type=int)  # Direct tweet id (if provided)
    original_id = request.args.get('original_id', type=int)
    version = request.args.get('version', type=int)

    connection = None
    cursor = None

    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)

        # Determine chat_id if not provided.
        if not chat_id:
            if user_session_id:
                user_id = get_user_id_from_session(user_session_id)
                if user_id:
                    query = """
                        SELECT DISTINCT ChatID 
                        FROM Content 
                        WHERE UserID = %s AND Closed = 0 AND ChatID IS NOT NULL
                        GROUP BY ChatID
                        ORDER BY MAX(CreatedAt) DESC
                    """
                    cursor.execute(query, (user_id,))
                    chat_ids = cursor.fetchall()
                    if chat_ids:
                        chat_id = chat_ids[0]['ChatID']
            if not chat_id:
                cookie_id = request.cookies.get('saves_your_work')
                if cookie_id:
                    query = """
                        SELECT DISTINCT ChatID 
                        FROM Content 
                        WHERE CookieID = %s AND Closed = 0 AND ChatID IS NOT NULL
                        GROUP BY ChatID
                        ORDER BY MAX(CreatedAt) DESC
                    """
                    cursor.execute(query, (cookie_id,))
                    chat_ids = cursor.fetchall()
                    if chat_ids:
                        chat_id = chat_ids[0]['ChatID']
            if not chat_id:
                chat_id = 1  # Default chat_id if none found.

        # If tweet_id is not provided but original_id and version are, fetch the tweet_id.
        if tweet_id is None and original_id is not None and version is not None:
            if user_session_id:
                user_id = get_user_id_from_session(user_session_id)
                if user_id:
                    query = """
                        SELECT ID FROM Content
                        WHERE OriginalID = %s AND Version = %s AND ChatID = %s AND UserID = %s
                              AND Closed = 0 AND ChatID IS NOT NULL
                    """
                    cursor.execute(query, (original_id, version, chat_id, user_id))
                    result = cursor.fetchone()
                    if result:
                        tweet_id = result["ID"]
            else:
                cookie_id = request.cookies.get('saves_your_work')
                if cookie_id:
                    query = """
                        SELECT ID FROM Content
                        WHERE OriginalID = %s AND Version = %s AND ChatID = %s AND CookieID = %s
                              AND Closed = 0 AND ChatID IS NOT NULL
                    """
                    cursor.execute(query, (original_id, version, chat_id, cookie_id))
                    result = cursor.fetchone()
                    if result:
                        tweet_id = result["ID"]

        # Fetch all posts for the determined chat_id.
        all_posts = []
        if user_session_id:
            user_id = get_user_id_from_session(user_session_id)
            if user_id:
                query = """
                    SELECT ID, ChatID, Input, Response, CreatedAt, ParentID, OriginalID, Version,
                           (SELECT COUNT(*) FROM Content AS t2 WHERE t2.OriginalID = Content.OriginalID) as TotalVersions
                    FROM Content 
                    WHERE UserID = %s AND ChatID = %s AND Closed = 0 AND ChatID IS NOT NULL
                """
                cursor.execute(query, (user_id, chat_id))
                all_posts = cursor.fetchall()
        else:
            cookie_id = request.cookies.get('saves_your_work')
            if cookie_id:
                query = """
                    SELECT ID, ChatID, Input, Response, CreatedAt, ParentID, OriginalID, Version,
                           (SELECT COUNT(*) FROM Content AS t2 WHERE t2.OriginalID = Content.OriginalID) as TotalVersions
                    FROM Content 
                    WHERE CookieID = %s AND ChatID = %s AND Closed = 0 AND ChatID IS NOT NULL
                """
                cursor.execute(query, (cookie_id, chat_id))
                all_posts = cursor.fetchall()

        # Compute the child chain using the provided (or derived) tweet id.
        child_chain = []
        if tweet_id is not None:
            child_chain = get_child_chain(all_posts, tweet_id)
        # Include the current tweet's ID at the beginning.
        full_chain = [tweet_id] + child_chain if tweet_id is not None else child_chain

        # Print the chain to the terminal.
        print("Tweet Chain (starting tweet + child chain):", ", ".join(str(pid) for pid in full_chain))

        # Build the comma-separated string of IDs.
        ids_str = ",".join(str(pid) for pid in full_chain)

        # Fetch the tweet content for each tweet using their IDs.
        tweets_fetched = []
        if full_chain:
            # Create a list of placeholders for the IN clause.
            placeholders = ",".join(["%s"] * len(full_chain))
            # Updated query to include TotalVersions
            query = (
                f"SELECT ID, ChatID, Input, Response, CreatedAt, ParentID, OriginalID, Version, "
                f"(SELECT COUNT(*) FROM Content AS t2 WHERE t2.OriginalID = Content.OriginalID) as TotalVersions "
                f"FROM Content WHERE ID IN ({placeholders})"
                f" ORDER BY FIELD(ID, " + ",".join(str(x) for x in full_chain) + ")"
            )
            cursor.execute(query, tuple(full_chain))
            tweets_fetched = cursor.fetchall()

        # Convert any datetime objects (like CreatedAt) to string format.
        for tweet in tweets_fetched:
            created_at = tweet.get("CreatedAt")
            if isinstance(created_at, (datetime.datetime, datetime.date)):
                tweet["CreatedAt"] = created_at.isoformat()

        # Create a dictionary for quick lookup by ID.
        tweets_dict = {tweet["ID"]: tweet for tweet in tweets_fetched}
        # Order the tweet info in the same order as full_chain.
        ordered_tweets = [tweets_dict[tid] for tid in full_chain if tid in tweets_dict]

        # Function to roughly approximate token count (assuming ~4 characters per token).
        def approximate_token_count(text):
            return len(text) / 4

        # Build the final response and enforce a 7000-token limit.
        response_data = {"IDs": ids_str, "tweets": []}
        final_tweets = []
        for tweet in ordered_tweets:
            final_tweets.append(tweet)
            response_data["tweets"] = final_tweets
            json_str = json.dumps(response_data)
            if approximate_token_count(json_str) > 7000:
                # Remove the tweet that caused the overflow and mark the response as truncated.
                final_tweets.pop()
                response_data["tweets"] = final_tweets
                response_data["truncated"] = True
                break

        return jsonify(response_data), 200

    except mysql.connector.Error as err:
        print("Error:", err)
        return jsonify({'error': 'Failed to retrieve data'}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

from flask import request, jsonify
import mysql.connector
import json
from app import app, db_config, get_user_id_from_session

def get_parent_chain(tweets, tweet_id):
    """
    Locate the tweet with the given tweet_id in the provided list of tweets.
    Then follow its ParentID chain upward until a tweet with no parent (ParentID is None) is found.
    Returns a list of parent IDs.
    """
    # Create a lookup dictionary for quick access to tweets by their ID.
    tweet_map = {tweet["ID"]: tweet for tweet in tweets}
    
    # Find the starting tweet.
    starting_tweet = tweet_map.get(tweet_id)
    if not starting_tweet:
        return []
    
    chain = []
    visited = set()
    current = starting_tweet
    while current.get("ParentID") is not None:
        parent_id = current.get("ParentID")
        # Prevent cycles.
        if parent_id in visited:
            break
        chain.append(parent_id)
        visited.add(parent_id)
        # Move to the parent tweet.
        current = tweet_map.get(parent_id)
        if not current:
            break
    return chain

@app.route('/api/app/tweetsreverse', methods=['GET'])
def get_tweetsreverse():
    # Retrieve parameters from the request.
    user_session_id = request.args.get('session_id') or request.cookies.get('user_session_id')
    chat_id = request.args.get('chat_id', type=int)
    tweet_id = request.args.get('id', type=int)  # Using tweet id

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

        # Compute the parent chain using the provided tweet id.
        parent_chain = []
        if tweet_id is not None:
            parent_chain = get_parent_chain(all_posts, tweet_id)
        # Include the current tweet's ID at the beginning.
        full_chain = [tweet_id] + parent_chain if tweet_id is not None else parent_chain

        # Print the chain to the terminal.
        print("Tweet Chain (new tweet + parent chain):", ", ".join(str(pid) for pid in full_chain))

        # Build the comma-separated string of IDs.
        ids_str = ",".join(str(pid) for pid in full_chain)

        # Fetch the tweet content for each tweet using their IDs.
        tweets_fetched = []
        if full_chain:
            # Create a list of placeholders for the IN clause.
            placeholders = ",".join(["%s"] * len(full_chain))
            # Query using the "ID" column (not ParentID) and order by the list order.
            query = (
                f"SELECT ID, Input, Response FROM Content WHERE ID IN ({placeholders})"
                f" ORDER BY FIELD(ID, " + ",".join(str(x) for x in full_chain) + ")"
            )
            cursor.execute(query, tuple(full_chain))
            tweets_fetched = cursor.fetchall()

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

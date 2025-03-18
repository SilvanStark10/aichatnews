from flask import request, jsonify
import mysql.connector
from app import app, db_config, get_user_id_from_session


@app.route('/api/app/chatids', methods=['GET'])
def get_chat_ids():
    # Get session ID from cookies
    user_session_id = request.cookies.get('user_session_id')
    
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)

        # Get the highest chat_id for this specific user/cookie
        if user_session_id:
            user_id = get_user_id_from_session(user_session_id)
            if user_id:
                query = """
                SELECT MAX(ChatID) as max_id 
                FROM Content 
                WHERE UserID = %s AND Closed = 0
                """
                cursor.execute(query, (user_id,))
                result = cursor.fetchone()
                new_chat_id = (result['max_id'] or 0) + 1
        else:
            cookie_id = request.cookies.get('saves_your_work')
            if cookie_id:
                query = """
                SELECT MAX(ChatID) as max_id 
                FROM Content 
                WHERE CookieID = %s AND Closed = 0
                """
                cursor.execute(query, (cookie_id,))
                result = cursor.fetchone()
                new_chat_id = (result['max_id'] or 0) + 1
            else:
                # For brand new users (no session, no cookie), start with Chat 1
                new_chat_id = 1

        chat_ids = []
        # First try to get chat IDs by session ID
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

        # If no session ID or no user found, try to get chat IDs by cookie
        if not chat_ids:
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

        # Add the new chat ID at the beginning of the list
        chat_ids.insert(0, {"ChatID": str(new_chat_id)})
        return jsonify(chat_ids), 200

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'error': 'Database error occurred', 'details': str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

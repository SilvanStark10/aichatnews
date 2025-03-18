import mysql.connector 
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import time
import threading
import json  # We will use this for the token count approximation
from groq import Client
from openai import OpenAI  # Add OpenAI import
import os
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

PORT = 3000

# Load environment variables from .env file!
load_dotenv()

# Initialize the OpenAI client with your API key
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Keep Groq client for backward compatibility if needed
client = Client(api_key=os.getenv('GROQ_API_KEY'))

# MySQL database configuration.
db_config = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME')
}


def get_client_ip():
    """
    Retrieve the client's IP address from the request.
    Considers the 'X-Forwarded-For' header if behind a proxy.
    """
    if request.headers.getlist("X-Forwarded-For"):
        ip = request.headers.getlist("X-Forwarded-For")[0].split(',')[0]
    else:
        ip = request.remote_addr
    return ip


def generate_response(conversation_messages):
    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",  # Use GPT-4o-mini model
        messages=conversation_messages
    )
    return response.choices[0].message.content if response.choices else ""


def save_to_database(input_text, response_text, ip_address_v6, ip_address_v4,
                     chat_id, user_id, cookie_id=None, edit_id=None):
    """
    If edit_id is provided, we create a new row that:
      - remains in the same ChatID as the tweet being edited,
      - sets ParentID to the parent tweet's ID (taken from the tweet being edited),
      - sets OriginalID to the original tweet's ID (taken from the tweet being edited).
    Otherwise, do normal 'new post' logic with a newly assigned OriginalID
    equal to the row's own ID.
    """
    debug_info = {}
    connection = None
    cursor = None
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)

        if not cookie_id:
            cookie_id = request.cookies.get('saves_your_work')

        # Normal insertion defaults:
        parent_id = None
        original_id = None

        if edit_id:
            # Retrieve the tweet being edited to get its ChatID, ParentID, and OriginalID
            find_row_query = """
                SELECT ChatID, ParentID, OriginalID
                FROM Content
                WHERE ID = %s
                LIMIT 1
            """
            cursor.execute(find_row_query, (edit_id,))
            existing_row = cursor.fetchone()

            if existing_row:
                # Override the chat_id with the same ChatID as the tweet being edited
                chat_id = existing_row.get("ChatID") or chat_id
                # Use the ParentID from the tweet being edited (i.e. the tweet above)
                parent_id = existing_row.get("ParentID")
                # Use the OriginalID from the tweet being edited if it exists; otherwise, use edit_id
                original_id = existing_row.get("OriginalID") if existing_row.get("OriginalID") is not None else edit_id
            else:
                parent_id = edit_id
                original_id = edit_id

            insert_query = """
                INSERT INTO Content 
                    (Input, Response, IPv6, IPv4, ChatID, UserID, CookieID, ParentID, OriginalID, CreatedAt)
                VALUES 
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """
            cursor.execute(insert_query, (
                input_text,
                response_text,
                ip_address_v6,
                ip_address_v4,
                chat_id,
                user_id,
                cookie_id,
                parent_id,
                original_id
            ))
            connection.commit()
            debug_info["parent_id"] = parent_id
            debug_info["original_id"] = original_id

        else:
            # No edit_id => normal "new post" logic.
            if user_id:
                query_parent = """
                    SELECT ID FROM Content 
                    WHERE ChatID = %s AND UserID = %s
                    ORDER BY CreatedAt DESC LIMIT 1
                """
                cursor.execute(query_parent, (chat_id, user_id))
                result = cursor.fetchone()
                if result:
                    parent_id = result["ID"]
            elif cookie_id:
                query_parent = """
                    SELECT ID FROM Content 
                    WHERE ChatID = %s AND CookieID = %s
                    ORDER BY CreatedAt DESC LIMIT 1
                """
                cursor.execute(query_parent, (chat_id, cookie_id))
                result = cursor.fetchone()
                if result:
                    parent_id = result["ID"]

            insert_query = """
                INSERT INTO Content (Input, Response, IPv6, IPv4, ChatID, UserID, CookieID, ParentID, CreatedAt)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """
            cursor.execute(insert_query, (
                input_text,
                response_text,
                ip_address_v6,
                ip_address_v4,
                chat_id,
                user_id,
                cookie_id,
                parent_id
            ))
            connection.commit()

            # Retrieve inserted ID and set OriginalID = that ID.
            inserted_id = cursor.lastrowid
            update_query = "UPDATE Content SET OriginalID = %s WHERE ID = %s"
            cursor.execute(update_query, (inserted_id, inserted_id))
            connection.commit()

            debug_info["parent_id"] = parent_id
            debug_info["original_id"] = inserted_id

        return debug_info

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        debug_info["error"] = str(err)
        return debug_info
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()


def generate_temp_cookie():
    """Generate a unique temporary cookie value"""
    import uuid
    return str(uuid.uuid4())


def print_number():
    time.sleep(1)
    print(11)


def main():
    # Remove the test message code
    print("Application initializing...")


def get_user_id_from_session(session_id):
    """Retrieve the UserID from the session ID."""
    if not session_id:
        return None
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()
        query = "SELECT UserID FROM Sessions WHERE SessionID = %s"
        cursor.execute(query, (session_id,))
        result = cursor.fetchone()
        return result[0] if result else None
    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return None
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()


def build_conversation_prompt(chat_id, new_user_message, user_session_id, cookie_id):
    """
    Build a conversation prompt from previous messages in the same chat along with
    the latest user message, ensuring that we do not exceed ~7000 tokens
    (approximated by the JSON string length of all messages).
    We remove the oldest messages first if we exceed the limit.
    """
    import json
    tokens_limit = 7000
    prompt = []
    connection = None
    cursor = None

    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)
        
        if user_session_id:
            user_id = get_user_id_from_session(user_session_id)
            if user_id:
                query = """
                SELECT Input, Response FROM Content 
                WHERE ChatID = %s AND UserID = %s AND Closed = 0
                ORDER BY CreatedAt ASC
                """
                cursor.execute(query, (chat_id, user_id))
                rows = cursor.fetchall()
            else:
                rows = []
        elif cookie_id:
            query = """
            SELECT Input, Response FROM Content 
            WHERE ChatID = %s AND CookieID = %s AND Closed = 0
            ORDER BY CreatedAt ASC
            """
            cursor.execute(query, (chat_id, cookie_id))
            rows = cursor.fetchall()
        else:
            rows = []
        
        for row in rows:
            if row.get("Input"):
                prompt.append({"role": "user", "content": row["Input"]})
            if row.get("Response"):
                prompt.append({"role": "assistant", "content": row["Response"]})

    except mysql.connector.Error as err:
        print(f"Error building conversation prompt: {err}")
        rows = []
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()
    
    # Append the new user message as the latest part of the conversation.
    prompt.append({"role": "user", "content": new_user_message})
    
    # Approximate token usage by counting the length of the JSON string:
    def approximate_token_count(messages):
        return len(json.dumps(messages, ensure_ascii=False))

    total_tokens = approximate_token_count(prompt)

    # Remove oldest messages until we are within the token limit,
    # always preserving the user's latest message.
    while total_tokens > tokens_limit and len(prompt) > 1:
        prompt.pop(0)
        total_tokens = approximate_token_count(prompt)
        
    return prompt


# -------------------------------------------------------
# Import our other routes from separate files:
# -------------------------------------------------------
import requestposts
import chatids
import newpost
import editpost
import tweetsreverse
# Initialize routes from newpost.py
newpost.init_routes(app)

# -------------------------------------------------------
# Final run logic remains the same
# -------------------------------------------------------
if __name__ == '__main__':
    threading.Thread(target=print_number).start()
    main()

    app.run(
        debug=True, 
        host='0.0.0.0', 
        port=PORT,
        ssl_context=('/etc/letsencrypt/live/goldpluto.com/fullchain.pem', 
                     '/etc/letsencrypt/live/goldpluto.com/privkey.pem')
    )




@app.route('/<chat_url>')
def get_chat_by_url(chat_url):
    # Only process URLs that match our format (38 characters)
    if len(chat_url) != 38:
        return jsonify({'error': 'Invalid URL'}), 404
        
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor(dictionary=True)
        
        # Get the ChatID for this URL
        query = "SELECT ChatID FROM Content WHERE ChatURL = %s LIMIT 1"
        cursor.execute(query, (chat_url,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({'error': 'Chat not found'}), 404
            
        chat_id = result['ChatID']
        
        # Redirect to the main app with this chat ID
        return redirect(f'/?chat_id={chat_id}')
        
    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'error': 'Database error'}), 500
    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()

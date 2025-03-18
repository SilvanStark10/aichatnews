from flask import Flask, request, jsonify
from flask_cors import CORS
import time
import threading
import json
from groq import Client
from openai import OpenAI
import os
from dotenv import load_dotenv
import mysql.connector

# Load environment variables from .env file
load_dotenv()

# Initialize the OpenAI client
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Keep Groq client for backward compatibility
client = Client(api_key=os.getenv('GROQ_API_KEY'))

# MySQL database configuration
db_config = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME')
}

def generate_temp_cookie():
    """Generate a unique temporary cookie value"""
    import uuid
    return str(uuid.uuid4())

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

def build_conversation_prompt(chat_id, new_user_message, user_session_id, cookie_id, parent_tweet_id=None, edit_id=None):
    """
    Build a conversation prompt using the tweetsreverse approach.
    
    If a parent tweet ID is provided (or derivable from an edit), only the tweet chain
    from that parent upward (ordered chronologically) is used, then the new user message is appended.
    This ensures that, when editing, the tweet being replaced (now hidden) is not included.
    
    The total prompt is trimmed if it exceeds ~7000 tokens.
    """
    tokens_limit = 7000
    prompt = []
    
    # If this is an edit and no explicit parent_tweet_id was provided, try to derive it
    if not parent_tweet_id and edit_id:
        try:
            connection = mysql.connector.connect(**db_config)
            cursor = connection.cursor(dictionary=True)
            query = "SELECT ParentID FROM Content WHERE ID = %s LIMIT 1"
            cursor.execute(query, (edit_id,))
            result = cursor.fetchone()
            if result:
                parent_tweet_id = result.get("ParentID")
        except mysql.connector.Error as err:
            print("Error fetching parent tweet for edit:", err)
        finally:
            if cursor:
                cursor.close()
            if connection and connection.is_connected():
                connection.close()
    
    # If we have a parent tweet ID, use the tweetsreverse approach to build the conversation chain.
    if parent_tweet_id:
        try:
            connection = mysql.connector.connect(**db_config)
            cursor = connection.cursor(dictionary=True)
            if user_session_id:
                user_id = get_user_id_from_session(user_session_id)
                if user_id:
                    query = """
                        SELECT ID, Input, Response, ParentID, CreatedAt 
                        FROM Content 
                        WHERE UserID = %s AND ChatID = %s AND Closed = 0
                    """
                    cursor.execute(query, (user_id, chat_id))
                else:
                    rows = []
            elif cookie_id:
                query = """
                    SELECT ID, Input, Response, ParentID, CreatedAt 
                    FROM Content 
                    WHERE CookieID = %s AND ChatID = %s AND Closed = 0
                """
                cursor.execute(query, (cookie_id, chat_id))
            else:
                rows = []
            rows = cursor.fetchall()
            # Build a lookup dictionary for tweets
            tweet_map = { tweet["ID"]: tweet for tweet in rows }
            # Get the parent chain starting from the given parent_tweet_id
            from tweetsreverse import get_parent_chain
            chain = get_parent_chain(rows, parent_tweet_id)  # returns a list of parent IDs (in order from immediate parent upward)
            full_chain = [parent_tweet_id] + chain  # chain in reverse order (newest first)
            # Reverse to obtain chronological order (oldest first)
            ordered_chain = full_chain[::-1]
            
            # Build the conversation prompt from the ordered tweet chain
            for tid in ordered_chain:
                tweet = tweet_map.get(tid)
                if tweet:
                    if tweet.get("Input"):
                        prompt.append({"role": "user", "content": tweet["Input"]})
                    if tweet.get("Response"):
                        prompt.append({"role": "assistant", "content": tweet["Response"]})
        except mysql.connector.Error as err:
            print("Error building conversation prompt with tweetsreverse:", err)
        finally:
            if cursor:
                cursor.close()
            if connection and connection.is_connected():
                connection.close()
    else:
        # No parent tweet—start with an empty prompt
        prompt = []
    
    # Append the new user message as the latest part of the conversation.
    prompt.append({"role": "user", "content": new_user_message})
    
    # Approximate token usage by counting the length of the JSON string:
    def approximate_token_count(messages):
        return len(json.dumps(messages, ensure_ascii=False))
    
    total_tokens = approximate_token_count(prompt)
    # Remove oldest messages until we are within the token limit, always preserving the latest user message.
    while total_tokens > tokens_limit and len(prompt) > 1:
        prompt.pop(0)
        total_tokens = approximate_token_count(prompt)
        
    return prompt

def generate_response(conversation_messages):
    try:
        # Use OpenAI's GPT-4o-mini model
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=conversation_messages
        )
        return response.choices[0].message.content if response.choices else ""
    except Exception as e:
        # Log the error and fall back to Groq if needed
        print(f"OpenAI API Error: {str(e)}")
        
        # Fallback to Groq
        try:
            print("Falling back to Groq API")
            groq_response = client.chat.completions.create(
                model="llama3-70b-8192",
                messages=conversation_messages
            )
            return groq_response.choices[0].message.content if groq_response.choices else ""
        except Exception as groq_err:
            print(f"Groq API Error: {str(groq_err)}")
            return "Sorry, I encountered an error processing your request."

def save_to_database(input_text, response_text, ip_address_v6, ip_address_v4,
                     chat_id, user_id, cookie_id=None, edit_id=None, parent_id=None):
    """
    Save message to database with proper parent relationship.
    Now accepts an explicit parent_id parameter to override automatic parent selection.
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
        original_id = None

        # Check if this chat already has a URL
        check_url_query = "SELECT ChatURL FROM Content WHERE ChatID = %s AND ChatURL IS NOT NULL LIMIT 1"
        cursor.execute(check_url_query, (chat_id,))
        existing_url = cursor.fetchone()

        chat_url = None
        if not existing_url:
            # Only generate a new URL if this chat doesn't have one yet
            import random
            import string
            chars = string.ascii_lowercase + string.digits
            chat_url = ''.join(random.choice(chars) for _ in range(38))
            
            # Ensure URL is unique across all chats
            while True:
                cursor.execute("SELECT 1 FROM Content WHERE ChatURL = %s LIMIT 1", (chat_url,))
                if not cursor.fetchone():
                    break
                chat_url = ''.join(random.choice(chars) for _ in range(38))
        else:
            chat_url = existing_url['ChatURL']

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

            # --- New code: Determine the Version for an edited tweet ---
            version_query = "SELECT MAX(Version) as max_version FROM Content WHERE OriginalID = %s"
            cursor.execute(version_query, (original_id,))
            version_result = cursor.fetchone()
            new_version = version_result["max_version"] + 1 if version_result and version_result["max_version"] is not None else 1

            # First insert the new version
            insert_query = """
                INSERT INTO Content 
                    (Input, Response, IPv6, IPv4, ChatID, UserID, CookieID, ParentID, OriginalID, Version, ChatURL, CreatedAt)
                VALUES 
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
                original_id,
                new_version,
                chat_url
            ))
            connection.commit()
            edited_id = cursor.lastrowid

            # After inserting, get the actual total versions count
            total_versions_query = "SELECT COUNT(*) as count FROM Content WHERE OriginalID = %s"
            cursor.execute(total_versions_query, (original_id,))
            total_versions = cursor.fetchone()["count"]

            debug_info["parent_id"] = parent_id
            debug_info["original_id"] = edited_id
            debug_info["version"] = new_version
            debug_info["TotalVersions"] = total_versions  # Add the actual count
            debug_info["chat_url"] = chat_url

        else:
            # Only try to find a parent if one wasn't explicitly provided
            if parent_id is None:
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

            # Modify the insert query to include the Version column set to 1:
            insert_query = """
                INSERT INTO Content 
                    (Input, Response, IPv6, IPv4, ChatID, UserID, CookieID, ParentID, Version, ChatURL, CreatedAt)
                VALUES 
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
                1,
                chat_url
            ))
            connection.commit()

            inserted_id = cursor.lastrowid
            update_query = "UPDATE Content SET OriginalID = %s WHERE ID = %s"
            cursor.execute(update_query, (inserted_id, inserted_id))
            connection.commit()

            debug_info["parent_id"] = parent_id
            debug_info["original_id"] = inserted_id
            debug_info["version"] = 1
            debug_info["chat_url"] = chat_url

        return debug_info

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        debug_info["error"] = str(err)
        return debug_info
    finally:
        if connection and connection.is_connected():
            cursor.close()
            connection.close()

def init_routes(app):
    @app.route('/api/app/newpost', methods=['POST'])
    def send_message():
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'Invalid JSON body'}), 400

            message = data.get('message', '')
            chat_id = data.get('chat_id', 1)
            edit_id = data.get('edit_id', None)
            parent_id = data.get('parent_id', None)

            # Simulate processing delay
            time.sleep(0)

            # Get client's IP addresses from request parameters
            ip_address_v4 = request.args.get('ipv4', type=str)
            ip_address_v6 = request.args.get('ipv6', type=str)

            user_session_id = request.cookies.get('user_session_id')
            temp_cookie = request.cookies.get('saves_your_work')

            if not user_session_id and not temp_cookie:
                temp_cookie = generate_temp_cookie()

            # Build conversation prompt from previous messages using the tweetsreverse approach.
            if user_session_id:
                prompt_messages = build_conversation_prompt(
                    chat_id, message, user_session_id, None,
                    parent_tweet_id=parent_id, edit_id=edit_id
                )
            else:
                prompt_messages = build_conversation_prompt(
                    chat_id, message, None, temp_cookie,
                    parent_tweet_id=parent_id, edit_id=edit_id
                )

            print("Groq payload sent:", prompt_messages)

            # Generate a response using the conversation prompt.
            response_content = generate_response(prompt_messages)

            # Retrieve UserID (if available) and save to the database.
            user_id = get_user_id_from_session(user_session_id)

            # Save to database with the explicit parent_id
            db_debug_info = save_to_database(
                input_text=message,
                response_text=response_content,
                ip_address_v6=ip_address_v6,
                ip_address_v4=ip_address_v4,
                chat_id=chat_id,
                user_id=user_id,
                cookie_id=temp_cookie,
                edit_id=edit_id,
                parent_id=parent_id
            )

            # Build a debug object to expose to the client.
            debug_info = {
                "chat_id": chat_id,
                "input_sent": message,
                "groq_payload": prompt_messages,
                "db_info": db_debug_info
            }

            # Create response object with additional debug info.
            response = jsonify({
                'response': response_content,
                'groq_payload': prompt_messages,
                'debug_info': debug_info
            })
            if not user_session_id and not request.cookies.get('saves_your_work'):
                response.set_cookie('saves_your_work', temp_cookie, max_age=30 * 24 * 60 * 60)  # 30 days

            return response, 200

        except Exception as e:
            print("Error in send_message:", e)
            return jsonify({'error': str(e)}), 500  

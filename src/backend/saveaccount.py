import mysql.connector
from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
import bcrypt
import uuid
from datetime import datetime, timedelta

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# MySQL database configuration
db_config = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME')
}

@app.route('/api/account/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email', '')
    password = data.get('password', '')
    first_name = data.get('first_name', '')
    last_name = data.get('last_name', '')
    print(f"Received email: {email}, password: {password}, first_name: {first_name}, last_name: {last_name}")

    # Check if email already exists.
    if email_exists(email):
        return jsonify({'message': 'Email Already Exists'}), 409

    # Hash the password
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    # Generate a unique UserID
    user_id = str(uuid.uuid4())  # Generate a UUID

    # Save to MySQL database
    save_to_database(user_id, email, hashed_password, first_name, last_name)

    # Create a session ID
    session_id = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(days=7)

    # Save session to database
    save_session_to_database(session_id, user_id, expires_at)

    # Update Content table with new UserID for entries with the same CookieID
    cookie_id = request.cookies.get('saves_your_work')
    if cookie_id:
        update_content_userid(cookie_id, user_id)

    return jsonify({
        'message': 'Account saved successfully!',
        'session_id': session_id,
        'clear_existing_sessions': True
    }), 200

def save_to_database(user_id, email, hashed_password, first_name, last_name):
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Insert data into Users table
        insert_query = """
        INSERT INTO Users (UserID, Email, Password, FirstName, LastName)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(insert_query, (user_id, email, hashed_password, first_name, last_name))
        connection.commit()

    except mysql.connector.Error as err:
        print(f"Error: {err}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def save_session_to_database(session_id, user_id, expires_at):
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Insert data into Sessions table
        insert_query = """
        INSERT INTO Sessions (SessionID, UserID, ExpiresAt)
        VALUES (%s, %s, %s)
        """
        cursor.execute(insert_query, (session_id, user_id, expires_at))
        connection.commit()

    except mysql.connector.Error as err:
        print(f"Error: {err}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def email_exists(email):
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Check if the email exists in the Users table
        query = "SELECT * FROM Users WHERE Email = %s"
        cursor.execute(query, (email,))
        result = cursor.fetchone()

        return result is not None

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return False
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

@app.route('/api/account/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '')
    password = data.get('password', '')

    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Retrieve the hashed password and user ID from the database
        query = "SELECT UserID, Password FROM Users WHERE Email = %s"
        cursor.execute(query, (email,))
        result = cursor.fetchone()

        if result and bcrypt.checkpw(password.encode('utf-8'), result[1].encode('utf-8')):
            user_id = result[0]

            # Create a session ID
            session_id = str(uuid.uuid4())
            expires_at = datetime.now() + timedelta(days=7)

            # Save session to database
            save_session_to_database(session_id, user_id, expires_at)

            # Check for existing 'saves_your_work' cookie
            temp_cookie = request.cookies.get('saves_your_work')
            if temp_cookie:
                update_content_userid(temp_cookie, user_id)
                response = jsonify({
                    'message': 'Login successful',
                    'session_id': session_id,
                    'clear_existing_sessions': True
                })
                response.set_cookie('saves_your_work', '', expires=0)
                response.set_cookie('user_session_id', session_id, max_age=7*24*60*60)
                return response, 200

            return jsonify({
                'message': 'Login successful',
                'session_id': session_id,
                'clear_existing_sessions': True
            }), 200
        else:
            return jsonify({'message': 'Wrong Email Or Wrong Password'}), 401

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'message': 'Internal Server Error'}), 500
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

def update_content_userid(cookie_id, user_id):
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        update_query = """
        UPDATE Content 
        SET UserID = %s 
        WHERE CookieID = %s
        """
        cursor.execute(update_query, (user_id, cookie_id))
        connection.commit()
    except mysql.connector.Error as err:
        print(f"Error updating Content UserID: {err}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

@app.route('/api/account/checkemail', methods=['POST'])
def check_email():
    data = request.get_json()
    email = data.get('email', '')

    if email_exists(email):
        return jsonify({'message': 'Email already exists'}), 409
    else:
        return jsonify({'message': 'Email is new'}), 200

@app.route('/api/account/userinfo', methods=['GET'])
def get_user_info():
    session_id = request.cookies.get('user_session_id')
    if not session_id:
        return jsonify({'logged_in': False}), 200

    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        # Retrieve user information based on session ID
        query = """
        SELECT Users.FirstName, Users.LastName
        FROM Users
        JOIN Sessions ON Users.UserID = Sessions.UserID
        WHERE Sessions.SessionID = %s AND Sessions.ExpiresAt > NOW()
        """
        cursor.execute(query, (session_id,))
        result = cursor.fetchone()

        if result:
            first_name, last_name = result
            return jsonify({'logged_in': True, 'first_name': first_name, 'last_name': last_name}), 200
        else:
            return jsonify({'logged_in': False}), 200

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'message': 'Internal Server Error'}), 500
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=3002)
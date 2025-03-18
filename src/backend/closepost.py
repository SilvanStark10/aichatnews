from flask import request, jsonify
import mysql.connector
from app import app, db_config


@app.route('/api/app/closepost', methods=['POST'])
def close_post():
    try:
        data = request.get_json()
        post_id = data.get('post_id')
        closed_value = data.get('closed', 1)  # Default to 1 if not specified

        if not post_id:
            return jsonify({'error': 'Post ID is required'}), 400

        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()

        update_query = """
        UPDATE Content 
        SET Closed = %s 
        WHERE ID = %s AND ChatID IS NOT NULL
        """
        cursor.execute(update_query, (closed_value, post_id))
        connection.commit()

        return jsonify({'success': True}), 200

    except mysql.connector.Error as err:
        print(f"Error: {err}")
        return jsonify({'error': 'Database error occurred'}), 500
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()

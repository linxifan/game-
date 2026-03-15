import sqlite3
import sys
import json
import os

db_path = os.path.join(os.path.dirname(__file__), 'database.sqlite')

def analyze():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No user_id provided"}))
        return

    user_id = sys.argv[1]

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Get max WPM for this user
        cursor.execute("SELECT MAX(wpm) as max_wpm FROM scores WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        user_max_wpm = row['max_wpm'] if row and row['max_wpm'] else 0

        # Averages and World Records
        WORLD_RECORD_WPM = 212  # Barbara Blackburn
        AVERAGE_MALE_WPM = 44
        AVERAGE_FEMALE_WPM = 37
        AVERAGE_WPM = 40

        diff_world_record = WORLD_RECORD_WPM - user_max_wpm
        
        result = {
            "user_max_wpm": user_max_wpm,
            "world_record_wpm": WORLD_RECORD_WPM,
            "average_wpm": AVERAGE_WPM,
            "average_male_wpm": AVERAGE_MALE_WPM,
            "average_female_wpm": AVERAGE_FEMALE_WPM,
            "diff_world_record": diff_world_record,
            "percentage_of_world_record": round((user_max_wpm / WORLD_RECORD_WPM) * 100, 2) if WORLD_RECORD_WPM else 0,
            "comparison_to_average": round(user_max_wpm - AVERAGE_WPM, 1)
        }

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    analyze()

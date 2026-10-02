import json
import os
import io
import csv
from flask import Flask, render_template, jsonify, request, Response
from models import ScheduleConfig, Period, Batch, Teacher, Room, Subject, ScheduledSlot
from scheduler import TimetableScheduler

app = Flask(__name__)

DATA_FILE = os.path.join(os.path.dirname(__file__), "current_data.json")
SAMPLE_FILE = os.path.join(os.path.dirname(__file__), "sample_data.json")

def load_data():
    target = DATA_FILE if os.path.exists(DATA_FILE) else SAMPLE_FILE
    with open(target, "r", encoding="utf-8") as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

# In-memory cached schedule
CURRENT_SCHEDULE = []

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data", methods=["GET"])
def get_data():
    data = load_data()
    return jsonify({
        "data": data,
        "schedule": CURRENT_SCHEDULE
    })

@app.route("/api/data/reset", methods=["POST"])
def reset_data():
    global CURRENT_SCHEDULE
    with open(SAMPLE_FILE, "r", encoding="utf-8") as f:
        sample = json.load(f)
    save_data(sample)
    CURRENT_SCHEDULE = []
    return jsonify({"success": True, "message": "Reset to default sample data successfully."})

@app.route("/api/generate", methods=["POST"])
def generate_schedule():
    global CURRENT_SCHEDULE
    data = load_data()

    try:
        config = ScheduleConfig(
            days=data["config"]["days"],
            periods=[Period(**p) for p in data["config"]["periods"]]
        )
        batches = [Batch(**b) for b in data["batches"]]
        teachers = [Teacher(**t) for t in data["teachers"]]
        rooms = [Room(**r) for r in data["rooms"]]
        subjects = [Subject(**s) for s in data["subjects"]]

        scheduler = TimetableScheduler(config, batches, teachers, rooms, subjects)
        result = scheduler.solve(max_attempts=150)

        CURRENT_SCHEDULE = result["schedule"]
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/subjects", methods=["POST"])
def add_subject():
    data = load_data()
    payload = request.json
    new_id = f"S{len(data['subjects']) + 1}_{int(os.urandom(2).hex(), 16)}"
    new_sub = {
        "id": new_id,
        "code": payload.get("code", "SUB").strip().upper(),
        "name": payload.get("name", "New Subject").strip(),
        "teacher_id": payload.get("teacher_id"),
        "batch_id": payload.get("batch_id"),
        "sub_batch_id": payload.get("sub_batch_id") if payload.get("sub_batch_id") else None,
        "weekly_hours": int(payload.get("weekly_hours", 3)),
        "is_lab": bool(payload.get("is_lab", False)),
        "color": payload.get("color", "#3b82f6")
    }
    data["subjects"].append(new_sub)
    save_data(data)
    return jsonify({"success": True, "subject": new_sub})

@app.route("/api/subjects/<sub_id>", methods=["DELETE"])
def delete_subject(sub_id):
    data = load_data()
    data["subjects"] = [s for s in data["subjects"] if s["id"] != sub_id]
    save_data(data)
    return jsonify({"success": True})

@app.route("/api/teachers", methods=["POST"])
def add_teacher():
    data = load_data()
    payload = request.json
    new_id = f"T{len(data['teachers']) + 1}"
    name = payload.get("name", "").strip()
    short = payload.get("short") or (name[:8] if name else "Faculty")
    new_teacher = {
        "id": new_id,
        "name": name,
        "short": short,
        "dept": payload.get("dept", "General").strip()
    }
    data["teachers"].append(new_teacher)
    save_data(data)
    return jsonify({"success": True, "teacher": new_teacher})

@app.route("/api/teachers/<teacher_id>", methods=["DELETE"])
def delete_teacher(teacher_id):
    data = load_data()
    data["teachers"] = [t for t in data["teachers"] if t["id"] != teacher_id]
    data["subjects"] = [s for s in data["subjects"] if s["teacher_id"] != teacher_id]
    save_data(data)
    return jsonify({"success": True})

@app.route("/api/rooms", methods=["POST"])
def add_room():
    data = load_data()
    payload = request.json
    new_id = f"R{len(data['rooms']) + 1}"
    new_room = {
        "id": new_id,
        "name": payload.get("name", f"Room {new_id}").strip(),
        "type": payload.get("type", "Lecture"),
        "capacity": int(payload.get("capacity", 60))
    }
    data["rooms"].append(new_room)
    save_data(data)
    return jsonify({"success": True, "room": new_room})

@app.route("/api/rooms/<room_id>", methods=["DELETE"])
def delete_room(room_id):
    data = load_data()
    data["rooms"] = [r for r in data["rooms"] if r["id"] != room_id]
    save_data(data)
    return jsonify({"success": True})

@app.route("/api/batches", methods=["POST"])
def add_batch():
    data = load_data()
    payload = request.json
    new_id = payload.get("id") or f"B{len(data['batches']) + 1}"
    sub_batches = [x.strip() for x in payload.get("sub_batches", "").split(",") if x.strip()]
    new_batch = {
        "id": new_id,
        "name": payload.get("name", f"Batch {new_id}").strip(),
        "sub_batches": sub_batches,
        "capacity": int(payload.get("capacity", 75))
    }
    data["batches"].append(new_batch)
    save_data(data)
    return jsonify({"success": True, "batch": new_batch})

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    data = load_data()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Day", "Period", "Time", "Class", "Sub-Batch", "Subject Code", "Subject Name", "Faculty", "Room", "Is Lab"])

    teachers = {t["id"]: t["name"] for t in data["teachers"]}
    rooms = {r["id"]: r["name"] for r in data["rooms"]}
    batches = {b["id"]: b["name"] for b in data["batches"]}
    subjects = {s["id"]: s for s in data["subjects"]}
    periods = {p["id"]: p for p in data["config"]["periods"]}

    for slot in CURRENT_SCHEDULE:
        sub = subjects.get(slot["subject_id"], {})
        per = periods.get(slot["period_id"], {})
        writer.writerow([
            slot["day"],
            per.get("label", f"Period {slot['period_id']}"),
            per.get("time", ""),
            batches.get(slot["batch_id"], slot["batch_id"]),
            slot.get("sub_batch_id") or "Whole Class",
            sub.get("code", ""),
            sub.get("name", ""),
            teachers.get(slot["teacher_id"], slot["teacher_id"]),
            rooms.get(slot["room_id"], slot["room_id"]),
            "Yes" if slot.get("is_lab") else "No"
        ])

    csv_data = output.getvalue()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=college_timetable.csv"}
    )

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

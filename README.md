# 🗓️ Smart Timetable Generator (CSE Department Edition)

An intelligent, conflict-free college timetable generator mini-project built with **Python**, **Flask**, and a modern **Web UI**.

Configured for engineering college CSE curriculums featuring **SE**, **TE**, and **BE** classes with **Sub-Batch Lab Practicals** and **Zero-Gap Continuous Lectures**.

---

## 🌟 Key Features

1. **Three Academic Classes**:
   - **SE (Second Year CSE)**: Capacity 75, split into sub-batches **H1, H2, H3** (cap 25 each).
   - **TE (Third Year CSE)**: Capacity 75, split into sub-batches **T1, T2, T3** (cap 25 each).
   - **BE (Final Year CSE)**: Capacity 75, split into sub-batches **B1, B2, B3** (cap 25 each).

2. **Lectures Together & Labs Split**:
   - **Theory Lectures**: Attended by the entire class together (all sub-batches combined) in dedicated large Lecture Halls (`Classroom 201`, `202`, `203`).
   - **Practical Labs**: Conducted in sub-batches (H1, H2, H3) across specialized computing laboratories (`Computing Lab 1`, `Lab 2`, `Lab 3`, `Lab 4`) in parallel or rotated 2-hour blocks.

3. **Zero-Gap Continuous Lectures**:
   - **No Idle Hours**: Lectures for each class on any given day are clustered in contiguous back-to-back periods (e.g. Periods 1, 2, 3, 4 without random gaps).
   - Students don't have to wait for hours between classes.

4. **Multi-Perspective Views**:
   - 🎓 **View Whole Class (e.g. SE)**: Shows full lectures + multi-slot parallel labs (H1, H2, H3) neatly within the matrix.
   - 🔬 **View Specific Sub-Batch (e.g. SE-H1)**: Individual timetable showing common lectures + H1's personal lab slots.
   - 👨‍🏫 **View by Faculty**: Tracks individual teacher workload and schedules.
   - 🏛️ **View by Room**: Shows room occupancy and laboratory utilization.

5. **Export & Print**:
   - 📥 **Export to CSV**: Formatted spreadsheet including Class, Sub-Batch, Faculty, and Room details.
   - 🖨️ **Print / Save as PDF**: Clean print stylesheet formatted for paper or PDF saving.

---

## 🚀 How to Run

### 1. Start Server
```powershell
cd C:\Users\priya\.gemini\antigravity\scratch\timetable_generator
python app.py
```

### 2. Open in Browser
```
http://127.0.0.1:5000
```

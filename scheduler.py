import random
from typing import List, Dict, Tuple, Optional
from models import ScheduleConfig, Batch, Teacher, Room, Subject, ScheduledSlot, Period

class TimetableScheduler:
    def __init__(
        self,
        config: ScheduleConfig,
        batches: List[Batch],
        teachers: List[Teacher],
        rooms: List[Room],
        subjects: List[Subject]
    ):
        self.config = config
        self.batches = {b.id: b for b in batches}
        self.teachers = {t.id: t for t in teachers}
        self.rooms = {r.id: r for r in rooms}
        self.subjects = {s.id: s for s in subjects}
        self.active_periods = self.config.teaching_periods
        self.days = self.config.days
        self.period_ids = [p.id for p in self.active_periods]

    def _is_slot_available(
        self,
        day: str,
        period_id: int,
        batch_id: str,
        sub_batch_id: Optional[str],
        teacher_id: str,
        room_id: str,
        schedule: List[ScheduledSlot]
    ) -> bool:
        for slot in schedule:
            if slot.day == day and slot.period_id == period_id:
                # 1. Teacher double-booking
                if slot.teacher_id == teacher_id:
                    return False

                # 2. Room double-booking
                if slot.room_id == room_id:
                    return False

                # 3. Class & Sub-Batch collision
                if slot.batch_id == batch_id:
                    # If either is a whole-class lecture, no one else in this batch can have class
                    if slot.sub_batch_id is None or sub_batch_id is None:
                        return False
                    # If both are labs, conflict only if it's the exact same sub-batch
                    if slot.sub_batch_id == sub_batch_id:
                        return False

        return True

    def _get_suitable_rooms(self, is_lab: bool, preferred_room_id: Optional[str] = None) -> List[Room]:
        target_type = "Lab" if is_lab else "Lecture"
        suitable = [r for r in self.rooms.values() if r.type.lower() == target_type.lower()]
        if not suitable:
            suitable = list(self.rooms.values())

        if preferred_room_id and preferred_room_id in self.rooms:
            pref = self.rooms[preferred_room_id]
            if pref in suitable:
                suitable.remove(pref)
                return [pref] + suitable

        return suitable

    def _calculate_gaps(self, schedule: List[ScheduledSlot]) -> int:
        """Calculates total idle gaps between lectures for all classes across all days."""
        total_gaps = 0

        for batch_id in self.batches:
            for day in self.days:
                lecture_periods = sorted([
                    s.period_id for s in schedule 
                    if s.batch_id == batch_id and s.day == day and not s.is_lab
                ])
                if len(lecture_periods) > 1:
                    span = lecture_periods[-1] - lecture_periods[0] + 1
                    gaps = span - len(lecture_periods)
                    total_gaps += max(0, gaps)

        return total_gaps

    def _attempt_schedule(self, seed: Optional[int] = None) -> Tuple[bool, List[ScheduledSlot], List[str]]:
        if seed is not None:
            random.seed(seed)

        schedule: List[ScheduledSlot] = []
        unassigned_logs: List[str] = []

        # Standard 2-hour lab blocks (Periods 5 & 6, Periods 7 & 8, or Periods 1 & 2)
        lab_blocks = [(5, 6), (7, 8), (1, 2)]

        # --- STEP 1: Schedule Simultaneous 2-Hour Labs For Each Class ---
        # For each class, all sub-batches (e.g. H1, H2, H3) MUST have lab simultaneously in the same 2-hour block!
        for batch_id, batch in self.batches.items():
            sub_batches = batch.sub_batches or []
            if not sub_batches:
                continue

            # Group lab subjects for this class by sub-batch
            batch_labs = [s for s in self.subjects.values() if s.batch_id == batch_id and s.is_lab]
            labs_by_sb = {sb: [s for s in batch_labs if s.sub_batch_id == sb] for sb in sub_batches}
            
            # Number of lab sessions needed = number of labs per sub-batch (e.g. 5 for SE, 4 for TE, 5 for BE)
            num_sessions = max(len(labs) for labs in labs_by_sb.values()) if labs_by_sb else 0

            # Find matching simultaneous triplets/turns
            # We need to assign each session to a day and 2-hour block
            remaining_labs = {sb: list(labs_by_sb[sb]) for sb in sub_batches}
            
            # Available candidate day + block pairs
            time_slots = [(d, b[0], b[1]) for d in self.days for b in lab_blocks]
            random.shuffle(time_slots)

            # Sort time slots to prioritize afternoon blocks (5, 6) and (7, 8) for labs
            time_slots.sort(key=lambda s: 0 if s[1] in [5, 7] else 1)

            session_count = 0
            for day, p1, p2 in time_slots:
                if session_count >= num_sessions:
                    break

                # Check if this batch already has any class scheduled in this period pair [p1, p2]
                has_class_in_block = any(
                    s.batch_id == batch_id and s.day == day and s.period_id in [p1, p2] 
                    for s in schedule
                )
                if has_class_in_block:
                    continue

                # We need to pick 1 lab for each sub-batch such that:
                # - All teachers are distinct
                # - All rooms are distinct
                # - Teachers and rooms are available at (day, p1) and (day, p2)
                sub_candidates = {}
                possible = True

                for sb in sub_batches:
                    unassigned_for_sb = [l for l in remaining_labs[sb]]
                    if not unassigned_for_sb:
                        possible = False
                        break
                    sub_candidates[sb] = unassigned_for_sb

                if not possible:
                    continue

                # Find a valid assignment of 1 lab per sub-batch
                chosen_assignment = None
                lab_rooms = self._get_suitable_rooms(is_lab=True)

                # Try permutations of candidate labs
                sb_list = list(sub_batches)
                cands_sb0 = list(sub_candidates[sb_list[0]])
                cands_sb1 = list(sub_candidates[sb_list[1]]) if len(sb_list) > 1 else [None]
                cands_sb2 = list(sub_candidates[sb_list[2]]) if len(sb_list) > 2 else [None]
                random.shuffle(cands_sb0)
                random.shuffle(cands_sb1)
                random.shuffle(cands_sb2)

                found_turn = False
                for l0 in cands_sb0:
                    if found_turn: break
                    for l1 in cands_sb1:
                        if found_turn: break
                        if l1 and l1.teacher_id == l0.teacher_id: continue
                        for l2 in cands_sb2:
                            if found_turn: break
                            if l2:
                                if l2.teacher_id == l0.teacher_id or l2.teacher_id == l1.teacher_id: continue

                            combo = [c for c in [l0, l1, l2] if c is not None]
                            teachers = [c.teacher_id for c in combo]

                            # Check if all teachers are free at (day, p1) and (day, p2)
                            teachers_free = True
                            for t in teachers:
                                if not all(self._is_slot_available(day, p, batch_id, "TEMP", t, "TEMP_ROOM", schedule) for p in [p1, p2]):
                                    teachers_free = False
                                    break
                            if not teachers_free:
                                continue

                            # Find 3 distinct free lab rooms
                            avail_rooms = []
                            for r in lab_rooms:
                                if all(self._is_slot_available(day, p, "TEMP_B", "TEMP_SB", "TEMP_T", r.id, schedule) for p in [p1, p2]):
                                    avail_rooms.append(r)

                            if len(avail_rooms) >= len(combo):
                                random.shuffle(avail_rooms)
                                chosen_assignment = list(zip(combo, avail_rooms[:len(combo)]))
                                found_turn = True
                                break

                if found_turn and chosen_assignment:
                    # Place the simultaneous 2-hour labs!
                    for lab_subj, room in chosen_assignment:
                        schedule.append(ScheduledSlot(
                            day=day, period_id=p1, subject_id=lab_subj.id,
                            teacher_id=lab_subj.teacher_id, room_id=room.id,
                            batch_id=batch_id, sub_batch_id=lab_subj.sub_batch_id,
                            is_lab=True
                        ))
                        schedule.append(ScheduledSlot(
                            day=day, period_id=p2, subject_id=lab_subj.id,
                            teacher_id=lab_subj.teacher_id, room_id=room.id,
                            batch_id=batch_id, sub_batch_id=lab_subj.sub_batch_id,
                            is_lab=True
                        ))
                        remaining_labs[lab_subj.sub_batch_id].remove(lab_subj)

                    session_count += 1

            # Check if any labs could not be placed simultaneously
            for sb, rem in remaining_labs.items():
                for l in rem:
                    unassigned_logs.append(f"Could not place simultaneous lab {l.name} for {sb}")

        # --- STEP 1B: Schedule Whole-Class 2-Hour Labs (e.g. Major Project) ---
        whole_class_labs = [s for s in self.subjects.values() if s.is_lab and s.sub_batch_id is None]
        for wlab in whole_class_labs:
            placed = False
            lab_rooms = self._get_suitable_rooms(is_lab=True)
            time_slots = [(d, b[0], b[1]) for d in self.days for b in lab_blocks]
            random.shuffle(time_slots)
            time_slots.sort(key=lambda s: 0 if s[1] in [5, 7] else 1)

            for day, p1, p2 in time_slots:
                if placed: break
                if any(s.batch_id == wlab.batch_id and s.day == day and s.period_id in [p1, p2] for s in schedule):
                    continue
                for room in lab_rooms:
                    if self._is_slot_available(day, p1, wlab.batch_id, None, wlab.teacher_id, room.id, schedule) and \
                       self._is_slot_available(day, p2, wlab.batch_id, None, wlab.teacher_id, room.id, schedule):
                        schedule.append(ScheduledSlot(
                            day=day, period_id=p1, subject_id=wlab.id,
                            teacher_id=wlab.teacher_id, room_id=room.id,
                            batch_id=wlab.batch_id, sub_batch_id=None,
                            is_lab=True
                        ))
                        schedule.append(ScheduledSlot(
                            day=day, period_id=p2, subject_id=wlab.id,
                            teacher_id=wlab.teacher_id, room_id=room.id,
                            batch_id=wlab.batch_id, sub_batch_id=None,
                            is_lab=True
                        ))
                        placed = True
                        break
            if not placed:
                unassigned_logs.append(f"Could not place whole-class lab {wlab.name} for {wlab.batch_id}")

        # --- STEP 2: Schedule Whole-Class Theory Lectures with ZERO GAPS ---
        theory_subjects = [s for s in self.subjects.values() if not s.is_lab]
        class_lecture_hall = {
            "SE": "CR201",
            "TE": "CR202",
            "BE": "CR203"
        }

        # Build list of individual theory lecture hours
        lecture_items = []
        for s in theory_subjects:
            lecture_items.extend([s] * s.weekly_hours)
        random.shuffle(lecture_items)

        subject_day_count: Dict[str, Dict[str, int]] = {
            s.id: {d: 0 for d in self.days} for s in theory_subjects
        }

        for sub in lecture_items:
            placed = False
            pref_room = class_lecture_hall.get(sub.batch_id)
            suitable_rooms = self._get_suitable_rooms(is_lab=False, preferred_room_id=pref_room)

            day_candidates = list(self.days)
            random.shuffle(day_candidates)

            def day_fitness(d):
                existing = sorted([
                    s.period_id for s in schedule 
                    if s.batch_id == sub.batch_id and s.day == d and not s.is_lab
                ])
                subj_count = subject_day_count[sub.id][d]
                subj_penalty = 100 if subj_count >= 1 else 0
                load_penalty = len(existing) * 10
                return subj_penalty + load_penalty

            day_candidates.sort(key=day_fitness)

            for day in day_candidates:
                if placed:
                    break

                existing_lectures = sorted([
                    s.period_id for s in schedule 
                    if s.batch_id == sub.batch_id and s.day == day and not s.is_lab
                ])

                # Balance week: max 4 lectures per day for any class
                if len(existing_lectures) >= 4:
                    continue

                if subject_day_count[sub.id][day] >= 1 and any(subject_day_count[sub.id][d] == 0 for d in self.days):
                    continue

                # Candidate periods: prioritize contiguous periods in morning (1, 2, 3, 4)
                all_avail = [p for p in self.period_ids if p not in existing_lectures]

                def period_continuity_cost(p_id):
                    temp = sorted(existing_lectures + [p_id])
                    gap = (temp[-1] - temp[0] + 1) - len(temp)
                    # Prefer morning periods 1, 2, 3, 4 for lectures!
                    morning_pref = 0 if p_id in [1, 2, 3, 4] else 20
                    return gap * 100 + morning_pref + p_id

                candidate_periods = sorted(all_avail, key=period_continuity_cost)

                for period_id in candidate_periods:
                    # Enforce zero internal gaps
                    temp = sorted(existing_lectures + [period_id])
                    curr_gap = (temp[-1] - temp[0] + 1) - len(temp)
                    if curr_gap > 0 and len(existing_lectures) > 0:
                        continue

                    if placed:
                        break
                    for room in suitable_rooms:
                        if self._is_slot_available(day, period_id, sub.batch_id, None, sub.teacher_id, room.id, schedule):
                            schedule.append(ScheduledSlot(
                                day=day, period_id=period_id, subject_id=sub.id,
                                teacher_id=sub.teacher_id, room_id=room.id,
                                batch_id=sub.batch_id, sub_batch_id=None,
                                is_lab=False
                            ))
                            subject_day_count[sub.id][day] += 1
                            placed = True
                            break

            if not placed:
                unassigned_logs.append(f"Could not place lecture for {sub.name} ({sub.batch_id})")

        return (len(unassigned_logs) == 0), schedule, unassigned_logs

    def solve(self, max_attempts: int = 150) -> Dict:
        """Solves schedule with simultaneous labs, zero collisions, and zero gaps between lectures."""
        best_schedule: List[ScheduledSlot] = []
        best_gaps: int = 999999
        best_unassigned: List[str] = []
        total_hours = sum(s.weekly_hours for s in self.subjects.values())

        for attempt in range(max_attempts):
            success, schedule, unassigned = self._attempt_schedule(seed=attempt * 37 + 103)
            gaps = self._calculate_gaps(schedule)

            if success and len(schedule) == total_hours and gaps == 0:
                return {
                    "success": True,
                    "attempts": attempt + 1,
                    "schedule": [s.to_dict() for s in schedule],
                    "total_scheduled": len(schedule),
                    "total_requested": total_hours,
                    "conflicts": 0,
                    "gaps": 0,
                    "notes": "Generated optimal timetable with simultaneous sub-batch labs and ZERO lecture gaps!"
                }

            if success and len(schedule) == total_hours:
                if gaps < best_gaps:
                    best_gaps = gaps
                    best_schedule = schedule
                    best_unassigned = []
            elif len(schedule) > len(best_schedule):
                best_schedule = schedule
                best_unassigned = unassigned
                best_gaps = gaps

        is_complete = (len(best_schedule) == total_hours)
        return {
            "success": is_complete,
            "attempts": max_attempts,
            "schedule": [s.to_dict() for s in best_schedule],
            "total_scheduled": len(best_schedule),
            "total_requested": total_hours,
            "conflicts": len(best_unassigned),
            "gaps": best_gaps,
            "notes": f"Generated schedule ({'Complete' if is_complete else 'Partial'}) with {best_gaps} internal gap(s).",
            "unassigned_reasons": best_unassigned
        }

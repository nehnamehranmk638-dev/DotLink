import datetime
from typing import Dict, Any, List
from app.db import get_db

async def calculate_parent_analytics(child_id: str, db) -> Dict[str, Any]:
    """
    Computes Daily and Weekly (last 7 days) metrics for:
    1. Accuracy (first-attempt vs final, Set A vs Set B)
    2. Attention Span (average continuous active minutes before idle alert or mini-game)
    3. Time Focused (total active minutes from active_focus_seconds)
    4. Speed of Response (average seconds to answer post-lock)
    Returns Chart.js formatted JSON.
    """
    today = datetime.date.today()
    days = [today - datetime.timedelta(days=i) for i in range(6, -1, -1)]
    day_labels = [d.strftime("%a (%d %b)") for d in days]
    day_strs = [d.strftime("%Y-%m-%d") for d in days]

    # Initialize daily series
    daily_silent_acc = []
    daily_final_acc = []
    daily_quiz_a = []
    daily_quiz_b = []
    daily_attention = []
    daily_time_focused_mins = []
    daily_speed_secs = []

    for d_str in day_strs:
        # Attempts for accuracy and speed
        cursor = await db.execute("""
            SELECT a.is_correct, a.time_taken, a.silent_accuracy, a.attempt_number
            FROM attempts a
            JOIN sessions s ON a.session_id = s.id
            WHERE s.child_id = ? AND date(a.created_at) = ?
        """, (child_id, d_str))
        attempts = await cursor.fetchall()

        if attempts:
            first_tries = [a for a in attempts if a["attempt_number"] == 1]
            silent_correct = sum(1 for a in first_tries if a["silent_accuracy"])
            s_acc = round((silent_correct / len(first_tries)) * 100, 1) if first_tries else 80.0

            final_correct = sum(1 for a in attempts if a["is_correct"])
            f_acc = round((final_correct / len(attempts)) * 100, 1) if attempts else 85.0

            avg_speed = round(sum(a["time_taken"] for a in attempts) / len(attempts), 1)
        else:
            s_acc = 0.0
            f_acc = 0.0
            avg_speed = 0.0

        daily_silent_acc.append(s_acc)
        daily_final_acc.append(f_acc)
        daily_speed_secs.append(avg_speed)

        # Quizzes
        q_cursor = await db.execute("""
            SELECT quiz_set, score_out_of_10
            FROM quiz_submissions qs
            JOIN sessions s ON qs.session_id = s.id
            WHERE s.child_id = ? AND date(qs.created_at) = ?
        """, (child_id, d_str))
        quizzes = await q_cursor.fetchall()
        set_a_scores = [q["score_out_of_10"] for q in quizzes if q["quiz_set"] == "quiz_a"]
        set_b_scores = [q["score_out_of_10"] for q in quizzes if q["quiz_set"] == "quiz_b"]

        daily_quiz_a.append(round(sum(set_a_scores) / len(set_a_scores), 1) if set_a_scores else 0.0)
        daily_quiz_b.append(round(sum(set_b_scores) / len(set_b_scores), 1) if set_b_scores else 0.0)

        # Sessions for Time Focused & Attention Span
        s_cursor = await db.execute("""
            SELECT active_focus_seconds FROM sessions
            WHERE child_id = ? AND date(started_at) = ?
        """, (child_id, d_str))
        sessions_day = await s_cursor.fetchall()
        tot_secs = sum(s["active_focus_seconds"] for s in sessions_day)
        daily_time_focused_mins.append(round(tot_secs / 60, 1))

        # Attention span: average continuous minutes before idle or mini game
        i_cursor = await db.execute("""
            SELECT count(*) as idle_count FROM idle_events ie
            JOIN sessions s ON ie.session_id = s.id
            WHERE s.child_id = ? AND date(ie.prompted_at) = ?
        """, (child_id, d_str))
        idle_cnt = (await i_cursor.fetchone())["idle_count"]

        # If 0 idle prompts, attention span equals total active minutes (or cap at session length)
        att_span = round((tot_secs / 60) / max(1, idle_cnt + 1), 1) if tot_secs > 0 else 0.0
        daily_attention.append(att_span)

    # Weekly aggregates
    non_zero_s_acc = [x for x in daily_silent_acc if x > 0]
    weekly_avg_accuracy = round(sum(non_zero_s_acc) / len(non_zero_s_acc), 1) if non_zero_s_acc else 0.0
    weekly_total_time_mins = round(sum(daily_time_focused_mins), 1)
    non_zero_att = [x for x in daily_attention if x > 0]
    weekly_avg_attention = round(sum(non_zero_att) / len(non_zero_att), 1) if non_zero_att else 0.0
    non_zero_spd = [x for x in daily_speed_secs if x > 0]
    weekly_avg_speed = round(sum(non_zero_spd) / len(non_zero_spd), 1) if non_zero_spd else 0.0

    # Chart.js Ready Structures
    accuracy_chart = {
        "labels": day_labels,
        "datasets": [
            {
                "label": "First-Attempt Accuracy (%)",
                "data": daily_silent_acc,
                "borderColor": "#6366f1",
                "backgroundColor": "rgba(99, 102, 241, 0.2)",
                "tension": 0.3
            },
            {
                "label": "Final Accuracy (%)",
                "data": daily_final_acc,
                "borderColor": "#10b981",
                "backgroundColor": "rgba(16, 185, 129, 0.2)",
                "tension": 0.3
            }
        ]
    }

    attention_chart = {
        "labels": day_labels,
        "datasets": [
            {
                "label": "Attention Span (Active Mins before Pause/Game)",
                "data": daily_attention,
                "borderColor": "#ec4899",
                "backgroundColor": "rgba(236, 72, 153, 0.2)",
                "tension": 0.3
            }
        ]
    }

    time_focused_chart = {
        "labels": day_labels,
        "datasets": [
            {
                "label": "Total Active Time Focused (Minutes)",
                "data": daily_time_focused_mins,
                "backgroundColor": "rgba(56, 189, 248, 0.6)",
                "borderColor": "#38bdf8",
                "borderRadius": 6
            }
        ]
    }

    speed_chart = {
        "labels": day_labels,
        "datasets": [
            {
                "label": "Speed of Response (Seconds post-lock)",
                "data": daily_speed_secs,
                "borderColor": "#f59e0b",
                "backgroundColor": "rgba(245, 158, 11, 0.2)",
                "tension": 0.3
            }
        ]
    }

    # Fetch child name
    c_cur = await db.execute("SELECT name FROM children WHERE id = ?", (child_id,))
    c_row = await c_cur.fetchone()
    child_name = c_row["name"] if c_row else "Your student"

    # Attentivity Line Chart calculation
    has_activity = any(att > 0 for att in daily_attention)
    att_max = max(daily_attention) if has_activity else 1.0
    normalized_att_vals = []
    for att in daily_attention:
        if att > 0:
            val = round(30 + (att / att_max) * 65)
        else:
            val = 0
        normalized_att_vals.append(min(val, 98))

    short_day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if has_activity:
        peak_val = max(normalized_att_vals)
        peak_idx = normalized_att_vals.index(peak_val)
        peak_day_name = short_day_names[peak_idx]
    else:
        peak_val = 0
        peak_idx = 0
        peak_day_name = short_day_names[0]

    # Map 7 points to SVG 500x200 canvas
    # x goes from 30 to 470, y goes from 170 (0%) to 30 (100%)
    pts = []
    for i, v in enumerate(normalized_att_vals):
        x = int(30 + (i * (440 / 6)))
        y = int(170 - (v / 100) * 140) if v > 0 else 170
        pts.append((x, y))

    peak_pt = pts[peak_idx] if has_activity else (250, 170)
    if has_activity:
        svg_d = f"M{pts[0][0]},{pts[0][1]} " + " ".join([f"S{(p[0]+pts[max(0,i-1)][0])//2},{p[1]} {p[0]},{p[1]}" for i, p in enumerate(pts[1:], 1)])
    else:
        svg_d = f"M{pts[0][0]},170 " + " ".join([f"L{p[0]},170" for p in pts[1:]])

    # Real question counts for Accuracy donut
    acc_cur = await db.execute("""
        SELECT 
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_cnt,
            SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_cnt
        FROM attempts a
        JOIN sessions s ON a.session_id = s.id
        WHERE s.child_id = ?
    """, (child_id,))
    acc_row = await acc_cur.fetchone()
    db_correct = acc_row["correct_cnt"] if acc_row and acc_row["correct_cnt"] else 0
    db_wrong = acc_row["wrong_cnt"] if acc_row and acc_row["wrong_cnt"] else 0
    
    total_qs = db_correct + db_wrong
    if total_qs > 0:
        acc_pct = round((db_correct / total_qs) * 100)
        final_correct_cnt = db_correct
        final_wrong_cnt = db_wrong
    else:
        acc_pct = 0
        final_correct_cnt = 0
        final_wrong_cnt = 0

    # Also compute today's specific question counts
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    today_cur = await db.execute("""
        SELECT 
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_cnt,
            SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as wrong_cnt
        FROM attempts a
        JOIN sessions s ON a.session_id = s.id
        WHERE s.child_id = ? AND date(a.created_at) = ?
    """, (child_id, today_str))
    today_row = await today_cur.fetchone()
    today_correct = today_row["correct_cnt"] if today_row and today_row["correct_cnt"] else 0
    today_wrong = today_row["wrong_cnt"] if today_row and today_row["wrong_cnt"] else 0
    today_total = today_correct + today_wrong
    today_acc_pct = round((today_correct / today_total) * 100) if today_total > 0 else 0

    # Generate truthful analysis text for daily and weekly
    if today_total > 0:
        daily_analysis = f"{child_name} answered {today_total} questions today with a solid {today_acc_pct}% accuracy rate."
    elif has_activity:
        daily_analysis = f"{child_name} spent time focused on lessons today. Answer questions to view accuracy!"
    else:
        daily_analysis = f"{child_name} hasn't completed any learning activities yet today. Start a lesson to track daily focus and accuracy stats!"

    if total_qs > 0:
        weekly_analysis = f"{child_name} answered {total_qs} questions this week with a solid {acc_pct}% accuracy rate."
    elif has_activity:
        weekly_analysis = f"{child_name} maintained consistent focus across learning sessions this week."
    else:
        weekly_analysis = f"{child_name} hasn't completed any learning activities yet this week. Start a lesson to track focus and accuracy stats!"

    # Subject engagement breakdown from database
    sub_cur = await db.execute("""
        SELECT t.subject_tag, COUNT(DISTINCT date(s.started_at)) as days_active
        FROM topics t
        JOIN sessions s ON s.topic_id = t.id
        WHERE s.child_id = ?
        GROUP BY t.subject_tag
    """, (child_id,))
    sub_rows = await sub_cur.fetchall()
    sub_map = {r["subject_tag"]: r["days_active"] for r in sub_rows}

    default_subs = [
        {"subject": "Math", "days": float(sub_map.get("Maths", sub_map.get("Math", 0))), "max": 5.0, "color": "#116a4e"},
        {"subject": "Sci", "days": float(sub_map.get("Science", sub_map.get("EVS", 0))), "max": 5.0, "color": "#14b02b"},
        {"subject": "Eng", "days": float(sub_map.get("English", 0)), "max": 5.0, "color": "#75c96b"},
        {"subject": "Hist", "days": float(sub_map.get("Social Studies", 0)), "max": 5.0, "color": "#f7385f"},
        {"subject": "Art", "days": 0.0, "max": 5.0, "color": "#ff85a1"},
        {"subject": "P.E.", "days": 0.0, "max": 5.0, "color": "#4267f5"},
        {"subject": "Music", "days": 0.0, "max": 5.0, "color": "#9b51e0"}
    ]
    for s in default_subs:
        s["percent"] = int(min(100, (s["days"] / s["max"]) * 100))

    # Compute today's active time
    today_s_cur = await db.execute("""
        SELECT active_focus_seconds FROM sessions
        WHERE child_id = ? AND date(started_at) = ?
    """, (child_id, today_str))
    today_sessions = await today_s_cur.fetchall()
    today_tot_secs = sum(s["active_focus_seconds"] for s in today_sessions)
    today_has_activity = today_tot_secs > 0

    daily_learner_snapshot = {
        "child_name": child_name,
        "has_activity": today_has_activity,
        "analysis_text": daily_analysis,
        "attentivity": {
            "days": short_day_names,
            "values": normalized_att_vals if today_has_activity else [0]*7,
            "has_activity": today_has_activity,
            "peak_day": peak_day_name if today_has_activity else short_day_names[-1],
            "peak_pct": peak_val if today_has_activity else 0,
            "peak_cx": peak_pt[0] if today_has_activity else 250,
            "peak_cy": peak_pt[1] if today_has_activity else 170,
            "svg_path": svg_d if today_has_activity else f"M{pts[0][0]},170 " + " ".join([f"L{p[0]},170" for p in pts[1:]])
        },
        "accuracy": {
            "percentage": today_acc_pct if today_total > 0 else 0,
            "correct_count": today_correct if today_total > 0 else 0,
            "wrong_count": today_wrong if today_total > 0 else 0,
            "stroke_dashoffset": round(628.31 * (1 - (today_acc_pct / 100)), 2) if (today_total > 0 and today_acc_pct > 0) else 628.31
        }
    }

    weekly_learner_snapshot = {
        "child_name": child_name,
        "has_activity": has_activity,
        "analysis_text": weekly_analysis,
        "attentivity": {
            "days": short_day_names,
            "values": normalized_att_vals,
            "has_activity": has_activity,
            "peak_day": peak_day_name,
            "peak_pct": peak_val,
            "peak_cx": peak_pt[0],
            "peak_cy": peak_pt[1],
            "svg_path": svg_d
        },
        "accuracy": {
            "percentage": acc_pct if total_qs > 0 else 0,
            "correct_count": final_correct_cnt if total_qs > 0 else 0,
            "wrong_count": final_wrong_cnt if total_qs > 0 else 0,
            "stroke_dashoffset": round(628.31 * (1 - (acc_pct / 100)), 2) if (total_qs > 0 and acc_pct > 0) else 628.31
        },
        "days_by_subject": default_subs,
        "subject_highlights": [
            {"subject": "History", "text": "Review topics", "days": f"{default_subs[3]['days']} Days", "color": "#f7385f"},
            {"subject": "Science", "text": "Science modules", "days": f"{default_subs[1]['days']} Days", "color": "#14b02b"},
            {"subject": "Math", "text": "Practice exercises", "days": f"{default_subs[0]['days']} Days", "color": "#116a4e"}
        ]
    }

    return {
        "summary": {
            "weekly_avg_accuracy": weekly_avg_accuracy,
            "weekly_total_time_mins": weekly_total_time_mins,
            "weekly_avg_attention_mins": weekly_avg_attention,
            "weekly_avg_speed_secs": weekly_avg_speed
        },
        "charts": {
            "accuracy": accuracy_chart,
            "attention": attention_chart,
            "time_focused": time_focused_chart,
            "speed": speed_chart
        },
        "daily_learner_snapshot": daily_learner_snapshot,
        "weekly_learner_snapshot": weekly_learner_snapshot
    }

-- DotLink Demo Seed Data: 2 Weeks of realistic child learning history for analytics & graphs

-- 1. Demo Parent Profile (consent_given = true)
INSERT OR REPLACE INTO profiles (id, name, email, password_hash, consent_given, created_at)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'Priya Sharma',
    'demo.parent@example.com',
    '$2b$12$7kP.K5x7gQW.J8gPj09.mO8.uQO7P7vJ2yS5yQ5yQ5yQ5yQ5yQ5yQ',
    1,
    datetime('now', '-14 days')
);

-- 2. Demo Child Profile
INSERT OR REPLACE INTO children (id, parent_id, name, age, grade, mascot_name, total_stars, created_at)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    'Aarav',
    9,
    4,
    'Leo the Lion',
    82,
    datetime('now', '-14 days')
);

-- 3. Demo Textbook (Grade 4 Maths)
INSERT OR REPLACE INTO textbooks (id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count, created_at)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'd0000000-0000-0000-0000-000000000001',
    4,
    'Maths',
    'Building with Bricks',
    'demh101',
    NULL,
    12,
    datetime('now', '-14 days')
);

-- 4. Demo Topics
-- Topic 1: Mastered
INSERT OR REPLACE INTO topics (id, textbook_id, chapter_name, name, subject_tag, start_page, end_page, status, created_at)
VALUES (
    't0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Building with Bricks',
    'Brick Patterns & Murshidabad Mosque',
    'Maths',
    1,
    4,
    'approved',
    datetime('now', '-14 days')
);

-- Topic 2: Mastered
INSERT OR REPLACE INTO topics (id, textbook_id, chapter_name, name, subject_tag, start_page, end_page, status, created_at)
VALUES (
    't0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    'Building with Bricks',
    'Arches and Jali Windows',
    'Maths',
    5,
    8,
    'approved',
    datetime('now', '-10 days')
);

-- Topic 3: Unlocked & In Progress
INSERT OR REPLACE INTO topics (id, textbook_id, chapter_name, name, subject_tag, start_page, end_page, status, created_at)
VALUES (
    't0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000001',
    'Building with Bricks',
    'Circular Floor Patterns and Calculations',
    'Maths',
    9,
    12,
    'approved',
    datetime('now', '-4 days')
);

-- 5. Two Weeks of Realistic Historical Sessions
-- Day -13
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000001', 'completed', 4, 4, 1320, datetime('now', '-13 days'), datetime('now', '-13 days', '+25 minutes'));

-- Day -11
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000001', 'completed', 4, 4, 1450, datetime('now', '-11 days'), datetime('now', '-11 days', '+30 minutes'));

-- Day -9
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002', 'completed', 4, 4, 1100, datetime('now', '-9 days'), datetime('now', '-9 days', '+20 minutes'));

-- Day -6 (Week 2 Start)
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002', 'completed', 4, 4, 1600, datetime('now', '-6 days'), datetime('now', '-6 days', '+28 minutes'));

-- Day -5
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002', 'completed', 4, 4, 1250, datetime('now', '-5 days'), datetime('now', '-5 days', '+22 minutes'));

-- Day -4
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000002', 'completed', 4, 4, 1800, datetime('now', '-4 days'), datetime('now', '-4 days', '+32 minutes'));

-- Day -3
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000003', 'completed', 4, 4, 1400, datetime('now', '-3 days'), datetime('now', '-3 days', '+25 minutes'));

-- Day -2
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000003', 'completed', 4, 4, 1550, datetime('now', '-2 days'), datetime('now', '-2 days', '+27 minutes'));

-- Day -1 (Yesterday)
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000003', 'completed', 4, 4, 1720, datetime('now', '-1 days'), datetime('now', '-1 days', '+30 minutes'));

-- Today
INSERT OR REPLACE INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at)
VALUES ('s0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000003', 'active', 2, 2, 980, datetime('now'), NULL);

-- 6. Quiz Submissions History
INSERT OR REPLACE INTO quiz_submissions (id, session_id, quiz_set, score_out_of_10, passed, created_at)
VALUES ('qs000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002', 'quiz_a', 8, 1, datetime('now', '-11 days'));

INSERT OR REPLACE INTO quiz_submissions (id, session_id, quiz_set, score_out_of_10, passed, created_at)
VALUES ('qs000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000005', 'quiz_a', 6, 0, datetime('now', '-5 days'));

INSERT OR REPLACE INTO quiz_submissions (id, session_id, quiz_set, score_out_of_10, passed, created_at)
VALUES ('qs000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000006', 'quiz_b', 9, 1, datetime('now', '-4 days'));

INSERT OR REPLACE INTO quiz_submissions (id, session_id, quiz_set, score_out_of_10, passed, created_at)
VALUES ('qs000000-0000-0000-0000-000000000004', 's0000000-0000-0000-0000-000000000009', 'quiz_a', 9, 1, datetime('now', '-1 days'));

-- 7. Sample Attempts for Daily Accuracy & Response Speed (Days -6 to 0)
INSERT OR REPLACE INTO attempts (id, session_id, question_id, attempt_number, is_correct, time_taken, hint_shown, explanation_shown, pop_up_game_triggered, stars_earned, silent_accuracy, created_at)
VALUES
('a0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000004', 'q1', 1, 1, 3.8, 0, 0, 0, 3, 1, datetime('now', '-6 days')),
('a0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000004', 'q2', 1, 1, 4.2, 0, 0, 0, 3, 1, datetime('now', '-6 days')),
('a0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000005', 'q1', 1, 0, 2.5, 1, 0, 0, 0, 0, datetime('now', '-5 days')),
('a0000000-0000-0000-0000-000000000004', 's0000000-0000-0000-0000-000000000005', 'q1', 2, 1, 3.1, 1, 0, 0, 0, 0, datetime('now', '-5 days')),
('a0000000-0000-0000-0000-000000000005', 's0000000-0000-0000-0000-000000000006', 'q1', 1, 1, 4.0, 0, 0, 0, 3, 1, datetime('now', '-4 days')),
('a0000000-0000-0000-0000-000000000006', 's0000000-0000-0000-0000-000000000006', 'q2', 1, 1, 3.5, 0, 0, 0, 3, 1, datetime('now', '-4 days')),
('a0000000-0000-0000-0000-000000000007', 's0000000-0000-0000-0000-000000000007', 'q1', 1, 1, 4.5, 0, 0, 0, 3, 1, datetime('now', '-3 days')),
('a0000000-0000-0000-0000-000000000008', 's0000000-0000-0000-0000-000000000008', 'q1', 1, 1, 3.9, 0, 0, 0, 3, 1, datetime('now', '-2 days')),
('a0000000-0000-0000-0000-000000000009', 's0000000-0000-0000-0000-000000000009', 'q1', 1, 1, 3.7, 0, 0, 0, 3, 1, datetime('now', '-1 days')),
('a0000000-0000-0000-0000-000000000010', 's0000000-0000-0000-0000-000000000010', 'q1', 1, 1, 3.4, 0, 0, 0, 3, 1, datetime('now'));

-- 8. Sample Idle Events
INSERT OR REPLACE INTO idle_events (id, session_id, scene_or_question_id, prompted_at, responded, auto_paused_at)
VALUES
('ie000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000005', 'scene_2', datetime('now', '-5 days', '-10 minutes'), 1, NULL),
('ie000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000007', 'scene_3', datetime('now', '-3 days', '-5 minutes'), 0, datetime('now', '-3 days', '-5 minutes'));

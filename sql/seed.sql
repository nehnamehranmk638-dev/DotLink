-- ==============================================================================
-- DotLink Mock History Seed Script (sql/seed.sql)
-- ~2 weeks of mock history for the demo child
-- ==============================================================================

DO $$
DECLARE
  v_parent_id uuid;
  v_child_id uuid;
  v_textbook_id uuid;
  v_topic_id1 uuid;
  v_topic_id2 uuid;
  v_topic_id3 uuid;
  v_session_id1 uuid;
  v_session_id2 uuid;
  v_session_id3 uuid;
BEGIN
  -- 1. Grab first profile or active user
  SELECT id INTO v_parent_id FROM public.profiles LIMIT 1;
  IF v_parent_id IS NULL THEN
    RAISE NOTICE 'No profile found. Please sign up or create a profile first.';
    RETURN;
  END IF;

  -- 2. Grab or create demo child 'Alex'
  SELECT id INTO v_child_id FROM public.children WHERE parent_id = v_parent_id LIMIT 1;
  IF v_child_id IS NULL THEN
    INSERT INTO public.children (parent_id, name, age, grade, mascot_name, games_enabled)
    VALUES (v_parent_id, 'Alex', 8, 3, 'Pip the Fox', true)
    RETURNING id INTO v_child_id;
  END IF;

  -- 3. Create or reuse demo textbook
  SELECT id INTO v_textbook_id FROM public.textbooks WHERE parent_id = v_parent_id LIMIT 1;
  IF v_textbook_id IS NULL THEN
    INSERT INTO public.textbooks (parent_id, title, storage_path, page_count)
    VALUES (v_parent_id, 'Science Grade 3: Living Things', v_parent_id || '/demo_science_g3.pdf', 38)
    RETURNING id INTO v_textbook_id;
  END IF;

  -- 4. Create 3 topics
  INSERT INTO public.topics (textbook_id, subject, name, chapter_tag, start_page, end_page, status)
  VALUES 
    (v_textbook_id, 'Science', 'Plant Structures & Roots', 'Chapter 1', 4, 11, 'approved'),
    (v_textbook_id, 'Science', 'Photosynthesis & Solar Energy', 'Chapter 2', 12, 19, 'approved'),
    (v_textbook_id, 'Science', 'Ecosystems & Food Webs', 'Chapter 3', 20, 27, 'approved')
  RETURNING id INTO v_topic_id1;

  SELECT id INTO v_topic_id2 FROM public.topics WHERE name = 'Photosynthesis & Solar Energy' LIMIT 1;
  SELECT id INTO v_topic_id3 FROM public.topics WHERE name = 'Ecosystems & Food Webs' LIMIT 1;

  -- 5. Mock Sessions over the last 14 days
  INSERT INTO public.sessions (child_id, topic_id, started_at, ended_at, status)
  VALUES (v_child_id, v_topic_id1, now() - interval '10 days', now() - interval '10 days' + interval '12 minutes', 'ended')
  RETURNING id INTO v_session_id1;

  INSERT INTO public.sessions (child_id, topic_id, started_at, ended_at, status)
  VALUES (v_child_id, v_topic_id2, now() - interval '5 days', now() - interval '5 days' + interval '15 minutes', 'ended')
  RETURNING id INTO v_session_id2;

  INSERT INTO public.sessions (child_id, topic_id, started_at, ended_at, status)
  VALUES (v_child_id, v_topic_id3, now() - interval '1 day', now() - interval '1 day' + interval '14 minutes', 'ended')
  RETURNING id INTO v_session_id3;

  -- 6. Insert Attempts for Session 1 (High first-attempt accuracy)
  INSERT INTO public.attempts (session_id, question_id, is_correct, time_taken, idle_time, hint_used, attempt_number, stars_earned, silent_accuracy, adaptation_type)
  VALUES
    (v_session_id1, gen_random_uuid(), true, 4.2, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id1, gen_random_uuid(), true, 5.1, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id1, gen_random_uuid(), true, 6.0, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id1, gen_random_uuid(), false, 7.5, 0.0, false, 1, 0, 0.0, 'none'),
    (v_session_id1, gen_random_uuid(), true, 4.0, 0.0, true, 2, 1, 0.5, 'none');

  -- Insert Attempts for Session 2 (Break offer)
  INSERT INTO public.attempts (session_id, question_id, is_correct, time_taken, idle_time, hint_used, attempt_number, stars_earned, silent_accuracy, adaptation_type)
  VALUES
    (v_session_id2, gen_random_uuid(), true, 8.5, 2.0, false, 1, 3, 1.0, 'none'),
    (v_session_id2, gen_random_uuid(), false, 12.0, 4.0, true, 1, 0, 0.0, 'none'),
    (v_session_id2, gen_random_uuid(), false, 14.2, 6.0, true, 2, 0, 0.0, 'brain_break'),
    (v_session_id2, gen_random_uuid(), true, 6.1, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id2, gen_random_uuid(), true, 5.5, 0.0, false, 1, 3, 1.0, 'none');

  -- Insert Attempts for Session 3 (Rushing pacing cue)
  INSERT INTO public.attempts (session_id, question_id, is_correct, time_taken, idle_time, hint_used, attempt_number, stars_earned, silent_accuracy, adaptation_type)
  VALUES
    (v_session_id3, gen_random_uuid(), false, 1.1, 0.0, false, 1, 0, 0.0, 'rushing_visual'),
    (v_session_id3, gen_random_uuid(), true, 4.5, 0.0, false, 2, 1, 0.5, 'none'),
    (v_session_id3, gen_random_uuid(), true, 5.0, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id3, gen_random_uuid(), true, 6.2, 0.0, false, 1, 3, 1.0, 'none'),
    (v_session_id3, gen_random_uuid(), true, 4.8, 0.0, false, 1, 3, 1.0, 'none');

  -- 7. Game Attempts (Sensory break offers & mini-games)
  INSERT INTO public.game_attempts (session_id, trigger, choice, reason_codes, shadow, accepted, completed, resumed_lesson, duration)
  VALUES
    (v_session_id2, 'break_offer', 'game', ARRAY['slow_vs_baseline','low_accuracy'], false, true, true, true, 45),
    (v_session_id1, 'break_offer', 'continue', ARRAY['long_since_break'], false, false, false, true, 0),
    (v_session_id3, 'break_offer', 'rest', ARRAY['repeated_idle'], false, true, true, true, 30);

  -- 8. Topic Progress Rows
  INSERT INTO public.topic_progress (child_id, topic_id, status, silent_accuracy_avg, stars_total)
  VALUES
    (v_child_id, v_topic_id1, 'mastered', 0.85, 24),
    (v_child_id, v_topic_id2, 'needs_practice', 0.65, 18),
    (v_child_id, v_topic_id3, 'mastered', 0.78, 22)
  ON CONFLICT (child_id, topic_id) DO UPDATE SET
    status = EXCLUDED.status,
    silent_accuracy_avg = EXCLUDED.silent_accuracy_avg,
    stars_total = EXCLUDED.stars_total;

  -- 9. Parent Insights
  INSERT INTO public.insights (child_id, session_id, headline, detail, created_at)
  VALUES
    (v_child_id, v_session_id1, 'Strong Conceptual Mastery', 'Alex demonstrated high first-attempt accuracy (85%) on Plant Structures with confident recall.', now() - interval '10 days'),
    (v_child_id, v_session_id2, 'Healthy Rest Break Utilized', 'Alex accepted a tactile mini-game break when response times lengthened, returning with steady focus.', now() - interval '5 days'),
    (v_child_id, v_session_id3, 'Pacing Awareness Prompted', 'Tactile counting visuals helped Alex pause and review multi-step questions before tapping answers.', now() - interval '1 day');

  RAISE NOTICE 'Demo data successfully seeded for parent % and child %', v_parent_id, v_child_id;
END $$;

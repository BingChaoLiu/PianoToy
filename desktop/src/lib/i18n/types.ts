export interface Translation {
  app: {
    title: string;
    phase_label: string;
  };
  toast: {
    loaded: string;
    load_failed: string;
    /** Loading toast: cold-start converter boot (first run only). */
    generating_musicxml_first_run: string;
    /** Loading toast: conversion in progress (warm worker). */
    generating_musicxml: string;
    /** Success toast after MusicXML is generated + appended. */
    musicxml_generated: string;
    /** Error toast when conversion fails (score stays MIDI-only). */
    musicxml_failed: string;
  };
  header: {
    select_demo: string;
    load_mid: string;
    recording: string;
    stop: string;
    start_recording_tip: string;
    stop_recording_tip: string;
    replay_tip: string;
    save_midi_tip: string;
    sight_reading_tip: string;
    practice_tip: string;
    settings_tip: string;
  };
  drop: {
    title: string;
    hint: string;
  };
  sight: {
    title: string;
    close: string;
    key: string;
    octave: string;
    octave_short_low: string;
    octave_short_high: string;
    difficulty: string;
    bars: string;
    bpm: string;
    seed_label: string;
    generate: string;
    redo: string;
    redo_tip: string;
  };
  settings: {
    title: string;
    close: string;
    language: string;
    show_labels: string;
    color_mode: string;
    color_split: string;
    color_track: string;
    color_none: string;
    synth_enabled: string;
    time_window: string;
    hit_window: string;
    octave: string;
    octave_hint: string;
    tone: string;
    additive: string;
    load_samples: string;
    loading: string;
    ready: string;
    unload: string;
    load_failed: string;
    sf_hint: string;
    midi_devices: string;
    rescan_tip: string;
    no_backend: string;
    no_input: string;
    native: string;
    web: string;
  };
  song: {
    notes_count: string;
    unload_tip: string;
  };
  stats: {
    title: string;
    reset_tip: string;
    hits: string;
    missed: string;
    wrong: string;
    accuracy: string;
    avg_timing: string;
    no_data: string;
  };
  transport: {
    play_tip: string;
    pause_tip: string;
    tempo: string;
    loop_tip: string;
    clear_ab_tip: string;
    unload: string;
    replay_tip: string;
  };
  error: {
    title: string;
    retry: string;
  };
  difficulties: {
    beginner: string;
    intermediate: string;
    advanced: string;
  };
  home: {
    app_title: string;
    app_subtitle: string;
    rank: string;
    total_points: string;
    next_rank: string;
    free_title: string;
    free_desc: string;
    free_diff: string;
    random_title: string;
    random_desc: string;
    random_diff: string;
    score_title: string;
    score_desc: string;
    score_diff: string;
    reading_title: string;
    reading_desc: string;
    reading_diff: string;
    footer: string;
  };
  free: {
    summary_title: string;
    duration: string;
    key_presses: string;
    note_range: string;
    continue: string;
    back_home: string;
  };
  score: {
    title: string;
    search: string;
    import: string;
    no_results: string;
    custom: string;
    category_all: string;
    category_classical: string;
    category_traditional: string;
    category_custom: string;
    diff_all: string;
    diff_easy: string;
    diff_medium: string;
    diff_hard: string;
    grid_view: string;
    list_view: string;
  };
  hud: {
    score: string;
    combo: string;
    hp: string;
    progress: string;
  };
  result: {
    complete: string;
    failed: string;
    score: string;
    max_combo: string;
    accuracy: string;
    time: string;
    points_earned: string;
    retry: string;
    home: string;
    difficulty_up: string;
    difficulty_up_desc: string;
    stay: string;
    back_to_library: string;
  };
  countdown: {
    ready: string;
    go: string;
    press_space_start: string;
    press_space_resume: string;
    paused: string;
  };
  score_mode: {
    practice: string;
    challenge: string;
    practice_desc: string;
    challenge_desc: string;
    select_mode: string;
    start: string;
  };
  song_switcher: {
    title: string;
    current: string;
    switch_to: string;
  };
  view_mode: {
    waterfall: string;
    score: string;
  };
  score_view: {
    loading: string;
    no_score: string;
    load_failed: string;
    back_to_waterfall: string;
  };
  score_delete: {
    confirm: string;
    delete: string;
    failed: string;
  };
  listen_only: {
    label: string;
    active: string;
    disabled_tip: string;
  };
  import_dialog: {
    title: string;
    midi_zone: string;
    midi_zone_hint: string;
    name_label: string;
    cancel: string;
    confirm: string;
    drop_here: string;
    release_to_drop: string;
    file_too_large: string;
    midi_required: string;
    /** Checkbox label (MIDI imports only): generate a sheet-music view. */
    generate_musicxml: string;
    /** Checkbox hint explaining the conversion cost. */
    generate_musicxml_hint: string;
    /** Inline-progress stage label: WASM boot (first run only). */
    stage_loading_converter: string;
    /** Inline-progress hint shown during the cold converter boot. */
    stage_loading_converter_hint: string;
    /** Inline-progress stage label: conversion in progress. */
    stage_converting: string;
    /** Inline-progress hint shown during the conversion step. */
    stage_converting_hint: string;
    /** Inline-progress label while the (non-converting) import is saving. */
    importing: string;
    /** Heading for the inline conversion-failed surface. */
    conversion_failed: string;
    /** Button: proceed with the MIDI-only score (no sheet-music view). */
    continue_without_sheet_music: string;
  };
  reading: {
    mode_label: string;
    back: string;
    press_middle_c: string;
    press_middle_c_hint: string;
    correct: string;
    wrong: string;
    streak: string;
    best_streak: string;
    summary_title: string;
    continue: string;
    /** Shown while the daily queue loads from persisted progress. */
    loading: string;
    /** "What note is this?" prompt above the letter buttons. */
    prompt_name: string;
    /** "What key signature is this?" prompt above the key-name buttons (key-sig branch). */
    prompt_key_signature: string;
    /** "What interval is this?" prompt above the interval buttons (interval branch). */
    prompt_interval: string;
    /** "Find this key:" prompt above the piano (keyboard-location branch). */
    prompt_keyboard_location: string;
    /** "Slow" outcome label (timeout). */
    slow: string;
    /** Daily review queue finished — nothing left to practice today. */
    complete: string;
    /** "Remaining" count of cards left in today's queue. */
    remaining: string;
    /** Progression cue: a level was mastered. */
    level_mastered: string;
    /** Button to dismiss the progression cue. */
    keep_going: string;
    /** Label for the soft-timer countdown bar. */
    fluency: string;
    /** Practice/challenge toggle: practice mode label (T7). */
    practice_mode: string;
    /** Practice/challenge toggle: challenge mode label (T7). */
    challenge_mode: string;
    /** Challenge run-result panel title (T7). */
    run_result_title: string;
  };
  course: {
    /** Browser screen title. */
    title: string;
    /** Big CTA that plays the full daily queue across all unlocked levels. */
    daily_mix: string;
    /** Daily-mix subtitle when there are due/new cards. {n} = total queue size. */
    cards_due_today: string;
    /** Daily-mix subtitle when the queue is empty. */
    review_cleared: string;
    /** Button label to start a level-scoped drill. */
    practice: string;
    /** Status badge: locked level. */
    status_locked: string;
    /** Status badge: unlocked, not started. */
    status_ready: string;
    /** Status badge: started but not mastered. */
    status_in_progress: string;
    /** Status badge: mastered. */
    status_mastered: string;
    /** Branch/level badge: coming soon (not playable yet). */
    coming_soon: string;
    /** Branch name: reading-recognition. */
    branch_reading: string;
    /** Branch name: keyboard-location. */
    branch_keyboard: string;
    /** Branch name: interval-recognition. */
    branch_interval: string;
    /** Branch name: key-signature-recognition. */
    branch_key_signature: string;
    /** Level titles keyed by the level's titleKey suffix: course.reading.<track>.<kind>. */
    reading: {
      treble: Record<string, string>;
      bass: Record<string, string>;
    };
    /** Key-signature level titles keyed by accidental count: course.key_signature.<kind>. */
    key_signature: Record<string, string>;
    /** Interval level titles keyed by size range: course.interval.<kind>. */
    interval: Record<string, string>;
    /** Keyboard-location level titles keyed by strategy: course.keyboard_location.<kind>. */
    keyboard_location: Record<string, string>;
  };
  updater: {
    new_version: string;
    title: string;
    available_desc: string;
    update_now: string;
    later: string;
    downloading: string;
    install_and_relaunch: string;
    download_page: string;
    up_to_date: string;
    check_failed: string;
   installing: string;
    check: string;
    checking: string;
    downloading_progress: string;
    auto_unavailable_browser: string;
    auto_unavailable_error: string;
  };
}

export interface Translation {
  app: {
    title: string;
    phase_label: string;
  };
  toast: {
    loaded: string;
    load_failed: string;
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
    staff: string;
    pdf: string;
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
    pdf_zone: string;
    pdf_zone_hint: string;
    pdf_optional: string;
    name_label: string;
    cancel: string;
    confirm: string;
    drop_here: string;
    release_to_drop: string;
    file_too_large: string;
    midi_required: string;
    pdf_required: string;
  };
  pdf_view: {
    edit_anchors: string;
    add_anchor_here: string;
    use_current_time: string;
    no_pdf: string;
    loading: string;
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
  };
}

# Audio Lab

Open **Audio Lab** in the bottom navigation strip. The lab occupies the central workspace. Select a library file or **Open audio** to import one.

## Analyze and edit

The stereo waveform accepts a drag to select a range; numeric start/end fields provide precise control. Analysis reports duration, sample rate, peak and RMS dBFS, crest factor, estimated integrated LUFS, DC offset, stereo correlation, clipping, silence duration and transients. Spectrum uses a Hann-window FFT and averages channel power, including opposite-phase stereo.

Processing creates a new stereo 32-bit float WAV. The source remains intact. The chain is selection → optional WSOLA stretch → reverse/mono/polarity → gain → high/low-pass filters → stereo compressor → peak normalization → fades → sample-rate conversion → stereo sample-peak limiter. Compare **Audition source** with **Audition processed**, then export and optionally import the result into the library. **Place on timeline** uses the transport position and selected audio track.

The compressor uses 5 ms attack/80 ms release. The limiter is a linked instantaneous sample-peak limiter, not a true-peak or lookahead mastering limiter. LUFS is a gated K-weighted estimate, not a certified broadcast meter. Sample-rate conversion uses linear interpolation. WSOLA works best for rhythmic material; extreme stretches can introduce artifacts. Normalization occurs before fades and resampling, so a very short fade-only selection may finish below its chosen normalization target. WAV files can preserve values above 0 dBFS; use the limiter when a bounded output is needed.

## Signal generator

Generate sine, square, triangle, white noise, approximate pink noise, logarithmic sweep or impulse. Choose frequency, sweep endpoint, duration, level and sample rate. Save the generated WAV, analyze it and optionally import it. Frequency is bounded below Nyquist. Square/triangle generation is not band-limited.

## Recording and devices

Refresh device diagnostics to inspect the system's native input/output names, supported rates, channels and formats. Choose an input and destination audio track, then **Record to track**. The lab arms the track, captures to Documents/DEVOLUTION DECK/Recordings, and **Stop & analyze take** finalizes, places and analyzes the take. Device initialization errors appear in the interface. Main transport Stop also stops capture. During count-in, Stop cancels the pending capture.

Count-in is a timed delay using the configured bars/BPM. Enable the transport metronome if an audible guide is desired. Takes are preserved on capture errors and normal window close; a take interrupted by closing the app may need importing from the Recordings folder. Device diagnostics are descriptive and do not implement loopback latency calibration or hardware routing.

The current playback backend uses the OS default output device at 48 kHz. Playback and lab audition share that output; audition replaces the active playback. Hardware recording, output listening, third-party VSTs and venue control should be checked on the intended rig before live use.

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import {
  runBiomorphicPhaseFieldLab,
  type BiomorphicPhaseFieldLabResult,
} from "../../puzzle/cutters/biomorphic/generateBiomorphicPhaseField";
import {
  createPhaseFieldLabSettings,
  BIOMORPHIC_SEED_LAYOUT_MODES,
  parsePhaseFieldLabSettings,
  serializePhaseFieldLabSettings,
  type BiomorphicPhaseFieldLabSettings,
  type BiomorphicPhaseFieldNumerics,
  type BiomorphicPhaseFieldProfile,
  type BiomorphicPhaseFieldStyle,
} from "../../puzzle/cutters/biomorphic/phaseFieldLabConfig";
import { colors } from "../../theme";
import {
  deletePhaseFieldLabPreset,
  loadPhaseFieldLabPresets,
  savePhaseFieldLabPreset,
  type PhaseFieldLabPreset,
  type PhaseFieldLabStorage,
} from "./phaseFieldLabPersistence";
import {
  PHASE_FIELD_LAB_BUILT_INS,
  type PhaseFieldLabBuiltIn,
} from "./phaseFieldLabBuiltIns";

/** Slider span as [min, max, step]. Omit where dragging makes no sense. */
type FieldRange = readonly [number, number, number];

type NumericFieldProps = {
  label: string;
  value: number;
  hint?: string;
  onChange: (value: number) => void;
  range?: FieldRange;
};

const FRAME_EIGHT_ITERATION = 175;
const MAX_INTERACTIVE_WORK = 1_500_000_000;

function estimateSimulationWork(
  settings: BiomorphicPhaseFieldLabSettings,
): number {
  const width = settings.columns * settings.numerics.samplesPerPiece;
  const height = settings.rows * settings.numerics.samplesPerPiece;
  return (
    settings.rows *
    settings.columns *
    width *
    height *
    settings.profile.iterations
  );
}

function NumericField({
  label,
  value,
  hint,
  onChange,
  range,
}: NumericFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onChange(parsed);
    else setDraft(String(value));
  };
  // The slider covers the useful span, not the validator's absolute limits, so
  // dragging it never lands somewhere the solver cannot run. The text box stays
  // authoritative: values outside the span are still typeable.
  const slider =
    range && Platform.OS === "web"
      ? React.createElement("input", {
          type: "range",
          min: range[0],
          max: range[1],
          step: range[2],
          value: Math.min(range[1], Math.max(range[0], value)),
          aria_label: `${label} slider`,
          onChange: (event: { target: { value: string } }) =>
            onChange(Number(event.target.value)),
          style: { width: "100%", accentColor: colors.accent, marginTop: 6 },
        })
      : null;
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldHint}>
          {range ? `${range[0]} – ${range[1]}` : (hint ?? "")}
        </Text>
      </View>
      <TextInput
        accessibilityLabel={label}
        inputMode="decimal"
        onBlur={commit}
        onChangeText={setDraft}
        onSubmitEditing={commit}
        selectTextOnFocus
        style={styles.input}
        value={draft}
      />
      {slider}
      {range && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function LabButton({
  label,
  onPress,
  active = false,
  disabled = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.buttonActive,
        danger && styles.buttonDanger,
        (pressed || disabled) && styles.buttonDimmed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          active && styles.buttonTextActive,
          danger && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: React.PropsWithChildren<{ eyebrow: string; title: string }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.fieldGrid}>{children}</View>
    </View>
  );
}

function getStorage(): PhaseFieldLabStorage | null {
  if (Platform.OS !== "web" || typeof globalThis.localStorage === "undefined") {
    return null;
  }
  return globalThis.localStorage;
}

function svgDataUri(svg: string): string {
  if (Platform.OS === "web" && typeof globalThis.btoa === "function") {
    return `data:image/svg+xml;base64,${globalThis.btoa(svg)}`;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function FieldImage({ svg, label }: { svg: string; label: string }) {
  if (Platform.OS === "web") {
    return React.createElement("img", {
      alt: label,
      src: svgDataUri(svg),
      style: { width: "100%", height: "100%", objectFit: "contain" },
    });
  }
  return null;
}

function downloadText(filename: string, contents: string, type: string): void {
  if (Platform.OS !== "web") return;
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PhaseFieldLabScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1040;
  const [settings, setSettings] = useState(() => createPhaseFieldLabSettings());
  const [result, setResult] = useState<BiomorphicPhaseFieldLabResult | null>(
    null,
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [computing, setComputing] = useState(false);
  const [dirty, setDirty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [presets, setPresets] = useState<PhaseFieldLabPreset[]>([]);
  const [jsonDraft, setJsonDraft] = useState(() =>
    serializePhaseFieldLabSettings(settings),
  );

  const frames = result?.frames ?? [];
  const currentFrame = frames[frameIndex];
  const progress = currentFrame
    ? currentFrame.iteration / Math.max(1, settings.profile.iterations)
    : 0;
  const topologyStable = currentFrame
    ? Math.max(...currentFrame.componentCounts) === 1 &&
      Math.max(...currentFrame.holeCounts) === 0
    : null;

  useEffect(() => {
    const storage = getStorage();
    if (!storage) return;
    try {
      setPresets(loadPhaseFieldLabPresets(storage));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load presets",
      );
    }
  }, []);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = setInterval(() => {
      setFrameIndex((current) => {
        if (current + 1 >= frames.length) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, settings.frameDurationMs);
    return () => clearInterval(timer);
  }, [frames.length, playing, settings.frameDurationMs]);

  const updateSettings = (
    updater: (
      current: BiomorphicPhaseFieldLabSettings,
    ) => BiomorphicPhaseFieldLabSettings,
  ) => {
    setSettings((current) => {
      const next = updater(current);
      setJsonDraft(serializePhaseFieldLabSettings(next));
      return next;
    });
    setDirty(true);
    setNotice(null);
  };

  const updateProfile = <Key extends keyof BiomorphicPhaseFieldProfile>(
    key: Key,
    value: BiomorphicPhaseFieldProfile[Key],
  ) =>
    updateSettings((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));

  const updateNumerics = <Key extends keyof BiomorphicPhaseFieldNumerics>(
    key: Key,
    value: BiomorphicPhaseFieldNumerics[Key],
  ) =>
    updateSettings((current) => ({
      ...current,
      numerics: { ...current.numerics, [key]: value },
    }));

  const selectStyle = (style: BiomorphicPhaseFieldStyle) => {
    const defaults = createPhaseFieldLabSettings(style);
    updateSettings((current) => ({
      ...current,
      style,
      profile: defaults.profile,
    }));
  };

  const run = (runSettings = settings) => {
    const estimatedWork = estimateSimulationWork(runSettings);
    if (estimatedWork > MAX_INTERACTIVE_WORK) {
      const maximumIterations = Math.max(
        1,
        Math.floor(
          (MAX_INTERACTIVE_WORK * runSettings.profile.iterations) /
            estimatedWork,
        ),
      );
      setError(
        `This ${runSettings.columns}×${runSettings.rows} run is too large for the browser UI thread at ${runSettings.profile.iterations} iterations. Use RUN TO FRAME 8 or set Iterations to ${maximumIterations} or fewer. The full-resolution bake remains available in the cutter.`,
      );
      setComputing(false);
      return;
    }
    setComputing(true);
    setPlaying(false);
    setError(null);
    setNotice(null);
    setTimeout(() => {
      try {
        const next = runBiomorphicPhaseFieldLab(runSettings);
        setResult(next);
        setFrameIndex(0);
        setDirty(false);
        setNotice(
          next.vectorizationError
            ? `Captured ${next.frames.length} frames, but vectorization is unsafe: ${next.vectorizationError}`
            : `Captured ${next.frames.length} frames in ${(next.elapsedMs / 1000).toFixed(2)} s`,
        );
      } catch (runError) {
        setError(
          runError instanceof Error ? runError.message : "Simulation failed",
        );
      } finally {
        setComputing(false);
      }
    }, 20);
  };

  const runToFrameEight = () => {
    const previewSettings = {
      ...settings,
      profile: {
        ...settings.profile,
        iterations: FRAME_EIGHT_ITERATION,
      },
    };
    setSettings(previewSettings);
    setJsonDraft(serializePhaseFieldLabSettings(previewSettings));
    setDirty(true);
    run(previewSettings);
  };

  const savePreset = () => {
    const storage = getStorage();
    if (!storage) {
      setError("Preset storage is only available in the web lab");
      return;
    }
    try {
      const next = savePhaseFieldLabPreset(storage, settings);
      setPresets(next);
      setNotice(`Saved “${settings.name}”`);
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save preset",
      );
    }
  };

  const loadBuiltIn = (builtIn: PhaseFieldLabBuiltIn) => {
    setSettings(builtIn.settings);
    setJsonDraft(serializePhaseFieldLabSettings(builtIn.settings));
    setDirty(true);
    setError(null);
    setNotice(`Loaded “${builtIn.name}” — run to see it`);
  };

  const loadPreset = (preset: PhaseFieldLabPreset) => {
    setSettings(preset.settings);
    setJsonDraft(serializePhaseFieldLabSettings(preset.settings));
    setDirty(true);
    setPlaying(false);
    setNotice(`Loaded “${preset.settings.name}” — run to compare`);
    setError(null);
  };

  const removePreset = (id: string) => {
    const storage = getStorage();
    if (!storage) return;
    try {
      setPresets(deletePhaseFieldLabPreset(storage, id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete preset",
      );
    }
  };

  const importJson = () => {
    try {
      const parsed = parsePhaseFieldLabSettings(JSON.parse(jsonDraft));
      setSettings(parsed);
      setJsonDraft(serializePhaseFieldLabSettings(parsed));
      setDirty(true);
      setPlaying(false);
      setNotice("JSON applied — run to simulate");
      setError(null);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Invalid JSON",
      );
    }
  };

  // Each span is the range that is actually worth exploring, not the
  // validator's absolute bounds. Where a value is coupled to numerical
  // stability rather than to taste, there is no span and the hint says so.
  const physicsFields = useMemo(
    () =>
      [
        ["Iterations", "iterations", settings.profile.iterations, "steps", [100, 5000, 50]],
        ["Interface epsilon", "interfaceEpsilon", settings.profile.interfaceEpsilon, "thicker = softer line, coarser teeth", [0.004, 0.04, 0.001]],
        ["Supercooling", "supercooling", settings.profile.supercooling, "T₀", [0.05, 1, 0.05]],
        ["Gamma", "gamma", settings.profile.gamma, "γ", [1, 50, 1]],
        ["Growth bias", "alpha", settings.profile.alpha, "α", [0.3, 1.2, 0.05]],
        ["Latent heat", "latentHeat", settings.profile.latentHeat, "paper uses 1", [0, 3, 0.1]],
        ["Tip noise", "tipNoise", settings.profile.tipNoise, "breaks the even comb into a hierarchy", [0, 0.5, 0.01]],
        ["Piece variation", "pieceVariation", settings.profile.pieceVariation, "spread of the perturbation between seams", [0, 1, 0.05]],
        ["Spectrum harmonics", "spectrumHarmonics", settings.profile.spectrumHarmonics, "2 = the paper's gross + fine pair", [1, 8, 1]],
        ["Spectrum falloff", "spectrumFalloff", settings.profile.spectrumFalloff, "1 = same slope at every scale", [0, 2, 0.1]],
        ["Free rim", "freeRim", settings.profile.freeRim, "grown outer edge; vectorizer cannot yet trace it", [0, 0.5, 0.05]],
        ["Bath coupling", "bathCoupling", settings.profile.bathCoupling, "quench rate", [0, 30, 1]],
        ["Area conservation", "areaConservation", settings.profile.areaConservation, "not in the paper", [0, 2, 0.1]],
      ] as const,
    [settings.profile],
  );

  const numericFields = useMemo(
    () =>
      [
        ["Samples / piece", "samplesPerPiece", settings.numerics.samplesPerPiece, "also the physical piece size, not just detail", [16, 200, 2]],
        ["Spatial step", "dx", settings.numerics.dx, "stability: dt must stay under 0.25·dx²", undefined],
        ["Time step", "dt", settings.numerics.dt, "above 0.25·dx² the temperature field diverges", undefined],
        ["Relaxation time", "tau", settings.numerics.tau, "phase stability: dt/τ·(ε/dx)² under 0.25", undefined],
        ["Active threshold", "activeThreshold", settings.numerics.activeThreshold, "solve cutoff", undefined],
        ["Field margin", "boundingBoxMargin", settings.numerics.boundingBoxMargin, "px", [1, 16, 1]],
        ["Thermal margin", "thermalBoxMargin", settings.numerics.thermalBoxMargin, "px", [4, 96, 4]],
        ["Connectivity", "connectivityRadius", settings.numerics.connectivityRadius, "px", [0, 8, 1]],
        ["Topology projection", "topologyProjectionEvery", settings.numerics.topologyProjectionEvery, "every N steps", [1, 50, 1]],
        ["Smoothing passes", "smoothingPasses", settings.numerics.smoothingPasses, "Chaikin", [0, 4, 1]],
      ] as const,
    [settings.numerics],
  );

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.product}>FRUME / MATERIAL LAB</Text>
          <Text style={styles.title}>Phase-field cut editor</Text>
        </View>
        <View style={styles.topActions}>
          {dirty ? <Text style={styles.dirtyLabel}>UNRUN CHANGES</Text> : null}
          <LabButton label="SAVE PRESET" onPress={savePreset} />
          <LabButton
            disabled={computing}
            label="RUN TO FRAME 8"
            onPress={runToFrameEight}
          />
          <LabButton
            active
            disabled={computing}
            label={computing ? "SIMULATING…" : "RUN SIMULATION"}
            onPress={() => run()}
          />
        </View>
      </View>

      <View style={[styles.workspace, !wide && styles.workspaceNarrow]}>
        <View style={[styles.viewerColumn, !wide && styles.viewerColumnNarrow]}>
          <View style={styles.viewerHeader}>
            <View>
              <Text style={styles.eyebrow}>LIVE FIELD</Text>
              <Text style={styles.viewerTitle}>{settings.name}</Text>
            </View>
            <View style={styles.readouts}>
              <Text style={styles.readoutStrong}>
                {currentFrame ? currentFrame.iteration : 0}
              </Text>
              <Text style={styles.readout}>
                {" "}
                / {settings.profile.iterations} ITER
              </Text>
              <Text style={styles.readoutDot}>•</Text>
              <Text style={styles.readout}>
                {settings.columns}×{settings.rows} /{" "}
                {settings.numerics.samplesPerPiece} PX
              </Text>
              {topologyStable !== null ? (
                <>
                  <Text style={styles.readoutDot}>•</Text>
                  <Text
                    style={
                      topologyStable
                        ? styles.topologyStable
                        : styles.topologyBroken
                    }
                  >
                    {topologyStable ? "TOPOLOGY STABLE" : "TOPOLOGY BROKEN"}
                  </Text>
                </>
              ) : null}
              {currentFrame ? (
                <>
                  <Text style={styles.readoutDot}>•</Text>
                  <Text style={styles.readout}>
                    GROWTH {currentFrame.maximumPenetrationFromInitial} PX
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.viewport}>
            {currentFrame ? (
              <FieldImage
                label={`Phase field at iteration ${currentFrame.iteration}`}
                svg={currentFrame.svg}
              />
            ) : (
              <View style={styles.emptyState}>
                {computing ? (
                  <ActivityIndicator color={colors.accent} size="large" />
                ) : null}
                <Text style={styles.emptyTitle}>
                  {computing
                    ? "Solving the field"
                    : "Ready for a controlled run"}
                </Text>
                <Text style={styles.emptyBody}>
                  Every frame comes from the cutter’s multiphase solver. Start
                  with the interactive resolution, then raise samples per piece
                  for a bake.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.timelinePanel}>
            <View style={styles.timelineTrack}>
              <View
                style={[
                  styles.timelineProgress,
                  { width: `${progress * 100}%` },
                ]}
              />
              {frames.map((frame, index) => (
                <Pressable
                  accessibilityLabel={`Go to iteration ${frame.iteration}`}
                  key={`${frame.iteration}-${index}`}
                  onPress={() => {
                    setFrameIndex(index);
                    setPlaying(false);
                  }}
                  style={[
                    styles.tick,
                    {
                      left: `${(index / Math.max(1, frames.length - 1)) * 100}%`,
                    },
                    index === frameIndex && styles.tickActive,
                  ]}
                />
              ))}
            </View>
            <View style={styles.transport}>
              <LabButton
                disabled={frameIndex <= 0}
                label="PREV"
                onPress={() => {
                  setPlaying(false);
                  setFrameIndex((current) => Math.max(0, current - 1));
                }}
              />
              <LabButton
                active={playing}
                disabled={frames.length < 2}
                label={
                  playing
                    ? "PAUSE"
                    : frameIndex + 1 >= frames.length
                      ? "REPLAY"
                      : "PLAY"
                }
                onPress={() => {
                  if (frameIndex + 1 >= frames.length) setFrameIndex(0);
                  setPlaying((current) => !current);
                }}
              />
              <LabButton
                disabled={frameIndex + 1 >= frames.length}
                label="NEXT"
                onPress={() => {
                  setPlaying(false);
                  setFrameIndex((current) =>
                    Math.min(frames.length - 1, current + 1),
                  );
                }}
              />
              <Text style={styles.transportMeta}>
                {frames.length
                  ? `${frameIndex + 1} / ${frames.length} FRAMES`
                  : "NO CAPTURE"}
              </Text>
              {result ? (
                <LabButton
                  label="EXPORT SVG"
                  onPress={() =>
                    downloadText(
                      `${settings.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`,
                      result.finalSvg,
                      "image/svg+xml",
                    )
                  }
                />
              ) : null}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.controlsContent}
          style={[styles.controls, !wide && styles.controlsNarrow]}
        >
          <Section eyebrow="01 / RUN" title="Experiment">
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                onChangeText={(name) =>
                  updateSettings((current) => ({ ...current, name }))
                }
                style={styles.input}
                value={settings.name}
              />
            </View>
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Deterministic seed</Text>
              <TextInput
                onChangeText={(seed) =>
                  updateSettings((current) => ({ ...current, seed }))
                }
                style={styles.input}
                value={settings.seed}
              />
            </View>
            <View style={styles.styleSwitch}>
              <LabButton
                active={settings.style === "dendrite"}
                label="LIVING"
                onPress={() => selectStyle("dendrite")}
              />
              <LabButton
                active={settings.style === "amoeba"}
                label="AMOEBA"
                onPress={() => selectStyle("amoeba")}
              />
            </View>
            <NumericField
              label="Columns"
              range={[2, 8, 1]}
              value={settings.columns}
              onChange={(columns) =>
                updateSettings((current) => ({ ...current, columns }))
              }
            />
            <NumericField
              label="Rows"
              range={[2, 8, 1]}
              value={settings.rows}
              onChange={(rows) =>
                updateSettings((current) => ({ ...current, rows }))
              }
            />
            <NumericField
              hint="iterations"
              label="Capture every"
              range={[1, 500, 1]}
              value={settings.captureEvery}
              onChange={(captureEvery) =>
                updateSettings((current) => ({ ...current, captureEvery }))
              }
            />
            <NumericField
              hint="ms"
              label="Frame duration"
              range={[16, 600, 8]}
              value={settings.frameDurationMs}
              onChange={(frameDurationMs) =>
                updateSettings((current) => ({ ...current, frameDurationMs }))
              }
            />
          </Section>

          <Section eyebrow="02 / MODEL" title="Phase physics">
            {physicsFields.map(([label, key, value, hint, range]) => (
              <NumericField
                hint={hint}
                key={key}
                label={label}
                range={range}
                value={value}
                onChange={(next) => updateProfile(key, next)}
              />
            ))}
            <View style={styles.styleSwitch}>
              {[4, 6].map((symmetry) => (
                <LabButton
                  active={settings.profile.anisotropy.symmetry === symmetry}
                  key={symmetry}
                  label={`${symmetry}-FOLD`}
                  onPress={() =>
                    updateProfile("anisotropy", {
                      ...settings.profile.anisotropy,
                      symmetry,
                    })
                  }
                />
              ))}
            </View>
            <NumericField
              hint="0 turns anisotropy off entirely"
              label="Anisotropy depth"
              range={[0, 0.6, 0.05]}
              value={settings.profile.anisotropy.delta}
              onChange={(delta) =>
                updateProfile("anisotropy", {
                  ...settings.profile.anisotropy,
                  delta,
                })
              }
            />
          </Section>

          <Section eyebrow="03 / SEEDS" title="Initial layout">
            <View style={styles.styleSwitch}>
              {BIOMORPHIC_SEED_LAYOUT_MODES.map((mode) => (
                <LabButton
                  active={settings.profile.seedLayout.mode === mode}
                  key={mode}
                  label={mode.replace("-", " ").toUpperCase()}
                  onPress={() =>
                    updateProfile("seedLayout", {
                      ...settings.profile.seedLayout,
                      mode,
                    })
                  }
                />
              ))}
            </View>
            <NumericField
              hint="1 = isotropic, <1 columnar"
              label="Cell stretch"
              range={[0.3, 3, 0.1]}
              value={settings.profile.seedLayout.stretch}
              onChange={(stretch) =>
                updateProfile("seedLayout", {
                  ...settings.profile.seedLayout,
                  stretch,
                })
              }
            />
            <NumericField
              hint="share of a cell"
              label="Seed jitter"
              range={[0, 1, 0.05]}
              value={settings.profile.seedLayout.jitter}
              onChange={(jitter) =>
                updateProfile("seedLayout", {
                  ...settings.profile.seedLayout,
                  jitter,
                })
              }
            />
          </Section>

          <Section eyebrow="04 / INPUT" title="Edge perturbation">
            <NumericField
              label="Gross wavelength"
              range={[4, 80, 1]}
              value={settings.profile.lambda1}
              onChange={(value) => updateProfile("lambda1", value)}
            />
            <NumericField
              label="Gross amplitude"
              range={[0, 20, 0.5]}
              value={settings.profile.u1}
              onChange={(value) => updateProfile("u1", value)}
            />
            <NumericField
              label="Fine wavelength"
              range={[2, 40, 1]}
              value={settings.profile.lambda2}
              onChange={(value) => updateProfile("lambda2", value)}
            />
            <NumericField
              label="Fine amplitude"
              range={[0, 10, 0.5]}
              value={settings.profile.u2}
              onChange={(value) => updateProfile("u2", value)}
            />
            {[0, 1].map((index) => (
              <NumericField
                key={`warp-wave-${index}`}
                label={`Warp wavelength ${index + 1}`}
                range={[20, 300, 5]}
                value={settings.profile.warpWavelengths[index]}
                onChange={(value) => {
                  const wavelengths: [number, number] = [
                    ...settings.profile.warpWavelengths,
                  ];
                  wavelengths[index] = value;
                  updateProfile("warpWavelengths", wavelengths);
                }}
              />
            ))}
            {[0, 1].map((index) => (
              <NumericField
                key={`warp-amp-${index}`}
                label={`Warp amplitude ${index + 1}`}
                range={[0, 40, 1]}
                value={settings.profile.warpAmplitudes[index]}
                onChange={(value) => {
                  const amplitudes: [number, number] = [
                    ...settings.profile.warpAmplitudes,
                  ];
                  amplitudes[index] = value;
                  updateProfile("warpAmplitudes", amplitudes);
                }}
              />
            ))}
          </Section>

          <Section eyebrow="05 / SOLVER" title="Numerics">
            {numericFields.map(([label, key, value, hint, range]) => (
              <NumericField
                hint={hint}
                key={key}
                label={label}
                range={range}
                value={value}
                onChange={(next) => updateNumerics(key, next)}
              />
            ))}
          </Section>

          <Section eyebrow="06 / PRESETS" title="Cut styles">
            {PHASE_FIELD_LAB_BUILT_INS.map((builtIn) => (
              <Pressable
                key={builtIn.id}
                onPress={() => loadBuiltIn(builtIn)}
                style={styles.presetMain}
              >
                <Text style={styles.presetName}>{builtIn.name}</Text>
                <Text style={styles.presetMeta}>{builtIn.summary}</Text>
              </Pressable>
            ))}
          </Section>

          <Section eyebrow="07 / LIBRARY" title="Saved studies">
            {presets.length === 0 ? (
              <Text style={styles.mutedCopy}>
                No presets yet. Name the run and save it.
              </Text>
            ) : (
              presets.map((preset) => (
                <View key={preset.id} style={styles.presetRow}>
                  <Pressable
                    onPress={() => loadPreset(preset)}
                    style={styles.presetMain}
                  >
                    <Text style={styles.presetName}>
                      {preset.settings.name}
                    </Text>
                    <Text style={styles.presetMeta}>
                      {preset.settings.style.toUpperCase()} ·{" "}
                      {preset.settings.columns}×{preset.settings.rows} ·{" "}
                      {preset.settings.numerics.samplesPerPiece} PX
                    </Text>
                  </Pressable>
                  <LabButton
                    danger
                    label="DELETE"
                    onPress={() => removePreset(preset.id)}
                  />
                </View>
              ))
            )}
          </Section>

          <Section eyebrow="08 / PORTABLE" title="Preset JSON">
            <View style={styles.fieldWide}>
              <TextInput
                autoCapitalize="none"
                multiline
                onChangeText={setJsonDraft}
                spellCheck={false}
                style={[styles.input, styles.jsonInput]}
                value={jsonDraft}
              />
            </View>
            <LabButton label="APPLY JSON" onPress={importJson} />
            <LabButton
              label="DOWNLOAD JSON"
              onPress={() =>
                downloadText(
                  `${settings.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`,
                  serializePhaseFieldLabSettings(settings),
                  "application/json",
                )
              }
            />
          </Section>
        </ScrollView>
      </View>
    </View>
  );
}

const mono = Platform.select({
  web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  default: undefined,
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", backgroundColor: "#090a0a" },
  topBar: {
    minHeight: 84,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#292824",
    backgroundColor: "#111210",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  product: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 23,
    fontWeight: "600",
    marginTop: 5,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  dirtyLabel: {
    color: "#c7a96f",
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  workspace: { flex: 1, flexDirection: "row", minHeight: 0 },
  workspaceNarrow: { flexDirection: "column" },
  viewerColumn: { flex: 1, minWidth: 0, padding: 24, gap: 14 },
  viewerColumnNarrow: { flexGrow: 0, minHeight: 610 },
  viewerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  eyebrow: {
    color: "#ad8950",
    fontFamily: mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  viewerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  readouts: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  readoutStrong: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 16,
    fontWeight: "700",
  },
  readout: {
    color: colors.textMuted,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  readoutDot: { color: "#57554d", marginHorizontal: 8 },
  topologyStable: {
    color: "#8fb98a",
    fontFamily: mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
  },
  topologyBroken: {
    color: colors.danger,
    fontFamily: mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
  },
  viewport: {
    flex: 1,
    minHeight: 360,
    borderWidth: 1,
    borderColor: "#302f29",
    backgroundColor: "#0d0e0e",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 42,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "600",
    marginTop: 18,
  },
  emptyBody: {
    color: colors.textMuted,
    maxWidth: 480,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },
  timelinePanel: {
    borderWidth: 1,
    borderColor: "#302f29",
    backgroundColor: "#111210",
    padding: 14,
    gap: 14,
  },
  timelineTrack: {
    height: 20,
    backgroundColor: "#20211e",
    position: "relative",
    justifyContent: "center",
  },
  timelineProgress: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(216,162,74,0.16)",
  },
  tick: {
    position: "absolute",
    width: 2,
    height: 10,
    top: 5,
    backgroundColor: "#615d52",
  },
  tickActive: { width: 3, height: 20, top: 0, backgroundColor: colors.accent },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  transportMeta: {
    color: colors.textMuted,
    fontFamily: mono,
    fontSize: 10,
    marginLeft: 4,
    marginRight: "auto",
  },
  controls: {
    width: 440,
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: "#292824",
    backgroundColor: "#121310",
  },
  controlsNarrow: {
    width: "100%",
    maxHeight: 720,
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: "#292824",
  },
  controlsContent: { padding: 20, gap: 16 },
  section: {
    borderWidth: 1,
    borderColor: "#2e2d28",
    backgroundColor: "#171815",
    padding: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 14,
  },
  fieldGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { width: "48%", minWidth: 150, flexGrow: 1, gap: 6 },
  fieldWide: { width: "100%", gap: 6 },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  fieldHint: {
    color: "#777268",
    fontFamily: mono,
    fontSize: 9,
    textTransform: "uppercase",
  },
  input: {
    height: 39,
    borderWidth: 1,
    borderColor: "#3a3932",
    backgroundColor: "#0f100e",
    color: colors.textPrimary,
    fontFamily: mono,
    fontSize: 12,
    paddingHorizontal: 10,
    outlineStyle: "none",
  } as never,
  jsonInput: {
    height: 260,
    paddingTop: 10,
    textAlignVertical: "top",
    lineHeight: 17,
  },
  styleSwitch: { width: "100%", flexDirection: "row", gap: 8, marginBottom: 2 },
  button: {
    minHeight: 36,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#444139",
    backgroundColor: "#1b1b18",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonDanger: { borderColor: "rgba(217,112,95,0.45)" },
  buttonDimmed: { opacity: 0.48 },
  buttonText: {
    color: colors.textSecondary,
    fontFamily: mono,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
  },
  buttonTextActive: { color: colors.onAccent },
  buttonTextDanger: { color: colors.danger },
  error: {
    color: colors.danger,
    fontFamily: mono,
    fontSize: 11,
    lineHeight: 17,
  },
  notice: { color: "#bda372", fontFamily: mono, fontSize: 11, lineHeight: 17 },
  mutedCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  presetRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#2e2d28",
    paddingTop: 10,
    gap: 8,
  },
  presetMain: { flex: 1, paddingVertical: 4 },
  presetName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  presetMeta: {
    color: colors.textMuted,
    fontFamily: mono,
    fontSize: 9,
    marginTop: 4,
  },
});

const facets = [
  "intent-goal", "requirements", "ia-flow", "layout", "style", "content", "behavior",
  "audience", "tone-voice", "constraints", "accessibility", "states-edge-cases",
];
const hardChecks = [
  "missing-facet-source-coverage", "unresolved-decision-changing-ambiguity",
  "insufficient-direction-divergence", "missing-region-coverage",
  "missing-region-visual-strategy", "missing-region-visual-asset",
  "same-layout-different-copy", "unresolved-grid-contract",
  "missing-responsive-transformation", "ratio-without-rationale", "phi-everywhere",
  "responsive-ratio-preservation", "unsupported-claims", "invalid-asset-provenance",
  "invalid-visual-asset-contract",
  "fake-asset-evidence", "inaccessible-required-state", "builder-packet-over-budget",
  "placeholder-primary-visual", "generated-fake-product-preview", "hero-viewport-overflow",
  "missing-decision-ids", "conflicting-requirements",
];
const contextualChecks = [
  "eyebrow-overuse", "centered-hero-convergence", "serif-default-risk",
  "premium-palette-convergence", "weak-image-strategy", "excessive-card-containment",
  "unplanned-image-opportunity", "underpowered-hero-demonstration",
  "unmotivated-advanced-motion", "visual-system-drift", "depth-quality-decay-risk",
  "afterthought-conclusion-risk", "generated-copy-tells",
];

const direction = (index: number) => ({
  id: `direction-${index}`,
  structuralThesis: ["guided sequence", "editorial field", "modular workspace"][index],
  focalMechanism: ["media reveal", "kinetic typography", "live task canvas"][index],
  regionRhythm: ["wide-tight-wide", "quiet-burst-quiet", "dense-sparse-dense"][index],
  signatureTechnique: ["sticky chapters", "masked transitions", "spatial zoom"][index],
  heroWorkspaceArchitecture: ["asymmetric split", "manifesto stage", "command workspace"][index],
  shapeLanguage: ["soft frames", "sharp planes", "nested rails"][index],
  briefFitScore: 8 - index,
  executionRiskScore: 3 + index,
  convergenceRiskScore: 2 + index,
  selectionDecision: index === 0 ? "selected for narrative fit" : "preserved alternative",
});

const region = (id: string, layoutModel: string) => ({
  id,
  purpose: `Move the user through ${id}`,
  role: id === "hero" ? "establish outcome" : "prove and conclude",
  entryState: "visible context",
  exitState: "clear next action",
  contentDependency: "approved product truth",
  layoutModel,
  compositionAnchor: "primary content edge",
  hierarchyEvent: "one dominant focal shift",
  alignmentKeylines: "container edge and media focal line",
  contentMeasure: "45-68 characters",
  groupingModel: "proximity with one boundary",
  interaction: "focus, hover, loading, empty, and error states",
  responsiveTransformation: "single-column source order below content failure point",
  memorableDetail: "topic-specific transition",
  antiPattern: "generic equal cards",
  craftInvestment: "production",
  visualType: id === "hero" ? "generated-image" : "typography",
  visualRationale: id === "hero"
    ? "product-specific visual establishes context"
    : "live typography carries this region more clearly than decorative imagery",
  ...(id === "hero" ? { assetId: "hero" } : {}),
});

const candidate = (mode: "content-led" | "golden") => ({
  id: `proportion-${mode}`,
  mode,
  pageGrid: { maxWidth: 1440, columns: [4, 8, 12], gutters: [16, 24, 32] },
  alignmentKeylines: ["container", "copy", "media"],
  spacingScale: [4, 8, 12, 20, 32, 52, 84],
  typeScale: [14, 16, 24, 40, 64],
  textMeasure: "45-68 characters",
  breakpoints: [
    { width: 390, reason: "content collision" },
    { width: 768, reason: "two-column fit" },
    { width: 1440, reason: "maximum composition" },
  ],
  regionGeometry: ["hero 8:5 split", "proof full bleed", "conclusion compact"],
  ratioApplications: mode === "golden" ? [{
    regionId: "hero",
    target: "copy-media split",
    ratio: 1.618,
    contentRationale: "copy minimum and focal crop remain safe",
    fallback: "release to stacked flow",
    nestingDepth: 1,
    applicationsInRegion: 1,
  }] : [],
  responsiveReleaseRules: ["release ratio when copy or focal-safe area fails"],
});

export function validPromptPlan(surface = "marketing-landing"): Record<string, unknown> {
  return {
    kind: "prompt-plan", version: 1, id: `plan-${surface}`,
    rawRequest: "Create a coherent, responsive product experience",
    surface, promptMode: "generate",
    facetBindings: facets.map((facet) => ({
      facet, decisionChanging: false,
      decision: {
        id: `decision-${facet}`, value: `resolved ${facet}`, sourceType: "user",
        sourceRef: "brief", confidence: "high",
      },
    })),
    productTruth: {
      audienceSituation: "evaluating the product", desiredChange: "understand and act",
      primaryOutcome: "qualified intent", primaryAction: "start",
      availableProof: ["working product"], prohibitedClaims: ["invented metrics"],
      decisionChangingUnknowns: [], contentInventory: ["headline", "proof", "action"],
    },
    pageNarrative: { thesis: "Move from promise to proof to action" },
    directions: [0, 1, 2].map(direction), selectedDirectionId: "direction-0",
    visualSystem: {
      typography: "fluid sans scale with 45-68 character measure",
      palette: "neutral field with one cyan accent locked page-wide",
      spacingCadence: "4, 8, 12, 20, 32, 52, 84 pixel scale",
      grid: "12-column maximum 1440 pixel content grid",
      shapeGrammar: "16 pixel regions, pill controls only",
      depthMaterial: "tinted ambient shadows only at hierarchy changes",
      mediaGrade: "high-key imagery with protected focal areas",
      iconFamily: "phosphor", controlGarment: "custom controls with tactile active state",
      motionCharacter: "gentle reveal for hierarchy and state feedback",
      themeBehavior: "system theme using semantic tokens",
    },
    regions: [region("hero", "asymmetric split"), region("proof", "editorial rail"),
      region("conclusion", "action stage")],
    proportionCandidates: [candidate("content-led"), candidate("golden")],
    deliveryPlan: {
      assets: [{
        id: "hero", source: "imagegen", provenance: "generated",
        subject: "product-specific hero scene",
        narrativeJob: "establish context and outcome",
        aspectRatio: "4:5",
        focalSafeArea: "right-center subject, left copy-safe",
        cropBehavior: "preserve subject at 390-1440",
        altText: "Product in its intended context",
        loadingPriority: "eager above the fold",
        mobileTransformation: "stack below copy with centered focal crop",
        usedIn: ["hero"],
      }],
      viewports: [390, 768, 1024, 1440],
      states: "loading, empty, error, success", motion: "motivated transform and opacity",
      reducedMotion: "static hierarchy", javascriptFailure: "content and actions remain usable",
    },
    preflight: {
      checks: [
        "brief-source-binding", "direction-divergence", "region-architecture",
        "layout-proportion", "asset-claims", "accessibility-states", "responsive-runtime",
      ].map((group) => ({ id: `group-${group}`, group, severity: "hard", passed: true }))
        .concat(hardChecks.map((id) => ({
          id, group: "brief-source-binding", severity: "hard", passed: true,
        })))
        .concat(contextualChecks.map((id) => ({
          id, group: "taste-risk", severity: "contextual", passed: true,
        }))),
    },
    builderPacket: { ref: "builder-packet.md", tokenCount: 4800 },
  };
}

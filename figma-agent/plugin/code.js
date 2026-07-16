"use strict";
(() => {
  // shared/protocol.ts
  var DEFAULT_IDLE_MS = 3e5;
  var MIN_IDLE_MS = 1e3;
  var CHUNK_LIMIT = 512 * 1024;
  var BROKER_IDLE_SHUTDOWN_MS = 30 * 6e4;

  // shared/figma-changes.ts
  function mapChangeType(type) {
    switch (type) {
      case "CREATE":
        return "created";
      case "DELETE":
        return "deleted";
      case "PROPERTY_CHANGE":
        return "updated";
      default:
        return null;
    }
  }
  var OP_RANK = { deleted: 3, created: 2, updated: 1 };
  function coalesceChanges(raw) {
    const byId = /* @__PURE__ */ new Map();
    const propSets = /* @__PURE__ */ new Map();
    for (const c of raw) {
      const props = propSets.get(c.nodeId) ?? /* @__PURE__ */ new Set();
      for (const p of c.changedProps) props.add(p);
      propSets.set(c.nodeId, props);
      const prev = byId.get(c.nodeId);
      if (!prev) {
        byId.set(c.nodeId, { ...c, changedProps: [] });
        continue;
      }
      prev.op = OP_RANK[c.op] > OP_RANK[prev.op] ? c.op : prev.op;
      if (prev.nodeName === null && c.nodeName !== null) prev.nodeName = c.nodeName;
      if (!prev.nodeType && c.nodeType) prev.nodeType = c.nodeType;
      if (c.origin === "REMOTE") prev.origin = "REMOTE";
    }
    const out = [];
    for (const [id, c] of byId) {
      c.changedProps = [...propSets.get(id) ?? /* @__PURE__ */ new Set()].sort();
      out.push(c);
    }
    out.sort((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0);
    return out;
  }

  // plugin/src/main/font-match.ts
  var GENERIC_FAMILIES = /* @__PURE__ */ new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "math",
    "emoji",
    "fangsong",
    "-apple-system",
    "blinkmacsystemfont"
  ]);
  function normalizeFamily(name) {
    return name.toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
  }
  function parseFontStack(raw) {
    if (!raw) return [];
    const out = [];
    for (const part of raw.split(",")) {
      const fam = part.replace(/["']/g, "").trim();
      if (!fam) continue;
      if (GENERIC_FAMILIES.has(normalizeFamily(fam))) continue;
      out.push(fam);
    }
    return out;
  }
  function matchFamily(requested, available) {
    const want = normalizeFamily(requested);
    if (!want) return null;
    for (const a of available) if (normalizeFamily(a) === want) return a;
    for (const a of available) {
      const na = normalizeFamily(a);
      if (na.startsWith(`${want} `) || want.startsWith(`${na} `)) return a;
    }
    return null;
  }
  function matchFamilyStack(stack, available) {
    for (const fam of stack) {
      const hit = matchFamily(fam, available);
      if (hit) return hit;
    }
    return null;
  }
  function pickStyle(variants, availableStyles) {
    const norm = (s) => s.toLowerCase().replace(/\s+/g, "");
    const byNorm = /* @__PURE__ */ new Map();
    for (const s of availableStyles) byNorm.set(norm(s), s);
    for (const v of variants) {
      const hit = byNorm.get(norm(v));
      if (hit) return hit;
    }
    return null;
  }

  // plugin/src/main/executor-fonts.ts
  function getFontStyleVariants(weight, isItalic = false) {
    const regularMap = {
      100: ["Thin", "Hairline"],
      200: ["ExtraLight", "Extra Light", "UltraLight", "Ultra Light"],
      300: ["Light"],
      400: ["Regular", "Normal", "Book"],
      500: ["Medium"],
      600: ["SemiBold", "Semi Bold", "Semibold", "DemiBold", "Demi Bold"],
      700: ["Bold"],
      800: ["ExtraBold", "Extra Bold", "UltraBold", "Ultra Bold"],
      900: ["Black", "Heavy"]
    };
    const baseStyles = regularMap[weight] || ["Regular"];
    if (isItalic) {
      const italicStyles = [];
      for (const style of baseStyles) {
        if (style === "Regular" || style === "Normal") {
          italicStyles.push("Italic");
        } else {
          italicStyles.push(`${style} Italic`);
          italicStyles.push(`${style}Italic`);
        }
      }
      italicStyles.push("Italic");
      return italicStyles;
    }
    return baseStyles;
  }
  async function tryLoadFont(family, styleVariants) {
    for (const style of styleVariants) {
      try {
        await figma.loadFontAsync({ family, style });
        return { family, style };
      } catch {
      }
    }
    return null;
  }
  var availableFontsCache = null;
  async function getAvailableFonts() {
    if (availableFontsCache) return availableFontsCache;
    const stylesByFamily = /* @__PURE__ */ new Map();
    try {
      const list = await figma.listAvailableFontsAsync();
      for (const f of list) {
        const arr = stylesByFamily.get(f.fontName.family) ?? [];
        arr.push(f.fontName.style);
        stylesByFamily.set(f.fontName.family, arr);
      }
    } catch {
    }
    availableFontsCache = { families: [...stylesByFamily.keys()], stylesByFamily };
    return availableFontsCache;
  }
  async function loadBestFont(family, weight, isItalic = false, stack) {
    const variants = getFontStyleVariants(weight, isItalic);
    const { families, stylesByFamily } = await getAvailableFonts();
    if (families.length > 0) {
      const candidates = stack ? [...parseFontStack(stack), family] : [family];
      const matchedFamily = matchFamilyStack(candidates, families) ?? matchFamily(family, families);
      if (matchedFamily) {
        const styles = stylesByFamily.get(matchedFamily) ?? [];
        const style = pickStyle(variants, styles) ?? (isItalic ? pickStyle(getFontStyleVariants(weight, false), styles) : null) ?? pickStyle(["Regular", "Normal", "Book", "Medium"], styles) ?? styles[0];
        if (style) {
          try {
            await figma.loadFontAsync({ family: matchedFamily, style });
            return { family: matchedFamily, style };
          } catch {
          }
        }
      }
    }
    const requested = await tryLoadFont(family, variants);
    if (requested) return requested;
    if (isItalic) {
      const nonItalicFont = await tryLoadFont(family, getFontStyleVariants(weight, false));
      if (nonItalicFont) return nonItalicFont;
    }
    if (family !== "Inter") {
      const inter = await tryLoadFont("Inter", getFontStyleVariants(weight, false));
      if (inter) return inter;
    }
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    return { family: "Inter", style: "Regular" };
  }

  // plugin/src/main/executor-styles.ts
  var STYLE_FOLDER = "EaseDesign";
  function specNodeName(spec) {
    for (const candidate of [spec.name, spec.componentName, spec.type]) {
      if (typeof candidate === "string" && candidate.length > 0) return candidate;
    }
    return "Node";
  }
  function withCode(err, code) {
    err.code = code;
    return err;
  }
  var warnings = [];
  function resetImportWarnings() {
    warnings = [];
  }
  function pushImportWarning(w) {
    warnings.push(w);
  }
  function getImportWarnings() {
    return warnings.slice();
  }
  function rgbToFigma(c) {
    return { r: c.r, g: c.g, b: c.b };
  }
  function figmaColorToHex(c) {
    if (!c) return "#000000";
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  function hexToFigmaColor(hex) {
    const clean = hex.replace("#", "").trim();
    const full = clean.length === 3 ? clean.split("").map((ch) => ch + ch).join("") : clean;
    const int = parseInt(full.slice(0, 6), 16) || 0;
    const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r: (int >> 16 & 255) / 255, g: (int >> 8 & 255) / 255, b: (int & 255) / 255, a };
  }
  function exportFillToPaint(fill) {
    if ((fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL" || fill.type === "GRADIENT_ANGULAR") && fill.gradientStops && fill.gradientTransform) {
      return {
        type: fill.type,
        gradientStops: fill.gradientStops.map((stop) => ({
          color: { ...rgbToFigma(stop.color), a: stop.color.a },
          position: stop.position
        })),
        gradientTransform: fill.gradientTransform
      };
    }
    if (fill.color) {
      return { type: "SOLID", color: rgbToFigma(fill.color), opacity: fill.color.a };
    }
    return null;
  }
  function mapExportEffects(effects) {
    return effects.map((e) => {
      if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
        return { type: e.type, radius: e.radius, visible: true };
      }
      const color = e.color || { r: 0, g: 0, b: 0, a: 0.25 };
      return {
        type: e.type,
        color: { ...rgbToFigma(color), a: color.a },
        offset: e.offset || { x: 0, y: 0 },
        radius: e.radius,
        spread: e.spread || 0,
        visible: true,
        blendMode: "NORMAL"
      };
    });
  }
  async function createColorStyles(colors) {
    const styleMap = /* @__PURE__ */ new Map();
    for (const token of colors) {
      const style = figma.createPaintStyle();
      style.name = `${STYLE_FOLDER}/${token.name}`;
      style.paints = [{
        type: "SOLID",
        color: rgbToFigma(token.color),
        opacity: token.color.a
      }];
      styleMap.set(token.hex, style);
    }
    return styleMap;
  }
  async function createTextStyles(typography) {
    const styleMap = /* @__PURE__ */ new Map();
    for (const token of typography) {
      const loadedFont = await loadBestFont(token.family, token.weight);
      const style = figma.createTextStyle();
      style.name = `${STYLE_FOLDER}/${token.name}`;
      style.fontName = loadedFont;
      style.fontSize = token.size;
      if (token.lineHeight) {
        style.lineHeight = { value: token.lineHeight, unit: "PIXELS" };
      }
      if (token.letterSpacing) {
        style.letterSpacing = { value: token.letterSpacing, unit: "PIXELS" };
      }
      styleMap.set(token.name, style);
    }
    return styleMap;
  }
  async function createEffectStyles(shadows) {
    const styleMap = /* @__PURE__ */ new Map();
    for (const token of shadows) {
      const style = figma.createEffectStyle();
      style.name = `${STYLE_FOLDER}/${token.name}`;
      style.effects = mapExportEffects([token.effect]);
      styleMap.set(token.name, style);
    }
    return styleMap;
  }

  // plugin/src/main/executor-variables.ts
  var COLLECTION_NAME = "EaseDesign Tokens";
  var VARIABLE_TYPES = ["COLOR", "FLOAT", "STRING", "BOOLEAN"];
  var PAINT_FIELDS = ["fills", "strokes"];
  var BINDABLE_FIELDS = [
    "fills",
    "strokes",
    "cornerRadius",
    "itemSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "width",
    "height",
    "opacity"
  ];
  async function findOrCreateCollection(name) {
    const all = await figma.variables.getLocalVariableCollectionsAsync();
    return all.find((c) => c.name === name) ?? figma.variables.createVariableCollection(name);
  }
  function valuesEqual(a, b) {
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && "r" in a && "r" in b) {
      const ca = a;
      const cb = b;
      const eps = 1 / 512;
      return Math.abs(ca.r - cb.r) < eps && Math.abs(ca.g - cb.g) < eps && Math.abs(ca.b - cb.b) < eps && Math.abs((ca.a ?? 1) - (cb.a ?? 1)) < eps;
    }
    return a === b;
  }
  async function findReusableVariable(collection, type, value) {
    const vars = await figma.variables.getLocalVariablesAsync(type);
    const modeId = collection.modes[0].modeId;
    for (const v of vars) {
      if (v.variableCollectionId !== collection.id) continue;
      const existing = v.valuesByMode[modeId];
      if (existing === void 0) continue;
      if (typeof existing === "object" && existing !== null && existing.type === "VARIABLE_ALIAS") continue;
      if (valuesEqual(existing, value)) return v;
    }
    return null;
  }
  async function createOrReuseVariable(collection, name, type, value) {
    const existing = await findReusableVariable(collection, type, value);
    if (existing) return { variable: existing, reused: true };
    const variable = figma.variables.createVariable(name, collection, type);
    variable.setValueForMode(collection.modes[0].modeId, value);
    return { variable, reused: false };
  }
  async function createVariablesFromTokens(tokens) {
    const byTokenName = /* @__PURE__ */ new Map();
    try {
      const collection = await findOrCreateCollection(COLLECTION_NAME);
      for (const t of tokens.colors ?? []) {
        const value = { r: t.color.r, g: t.color.g, b: t.color.b, a: t.color.a };
        const { variable } = await createOrReuseVariable(collection, t.name, "COLOR", value);
        byTokenName.set(t.name, variable);
      }
      for (const t of tokens.spacing ?? []) {
        const { variable } = await createOrReuseVariable(collection, t.name, "FLOAT", t.value);
        byTokenName.set(t.name, variable);
      }
      for (const t of tokens.radii ?? []) {
        const { variable } = await createOrReuseVariable(collection, t.name, "FLOAT", t.value);
        byTokenName.set(t.name, variable);
      }
    } catch (err) {
      pushImportWarning(`variable creation failed (plan limits?): ${String(err)}`);
    }
    return byTokenName;
  }
  function bindVariableToField(node, field, variable) {
    if (PAINT_FIELDS.includes(field)) {
      const target = node;
      const current = target[field];
      const paints = Array.isArray(current) && current.length > 0 ? [...current] : [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
      paints[0] = figma.variables.setBoundVariableForPaint(paints[0], "color", variable);
      target[field] = paints;
    } else {
      node.setBoundVariable(field, variable);
    }
  }
  function applyTokenRefs(node, refs, tokenVars) {
    const bind = (field, tokenName) => {
      if (!tokenName) return;
      const variable = tokenVars.get(tokenName);
      if (!variable) {
        pushImportWarning(`token bind ${field}\u2192${tokenName} skipped on "${node.name}": no variable named "${tokenName}" in this file (library/remote token?) \u2014 literal value kept`);
        return;
      }
      try {
        bindVariableToField(node, field, variable);
      } catch (err) {
        pushImportWarning(`token bind ${field}\u2192${tokenName} failed on "${node.name}": ${String(err)}`);
      }
    };
    bind("fills", refs.fill ?? refs.textColor);
    bind("strokes", refs.stroke);
    bind("cornerRadius", refs.radius);
    bind("itemSpacing", refs.gap);
    if (refs.padding) {
      bind("paddingTop", refs.padding);
      bind("paddingRight", refs.padding);
      bind("paddingBottom", refs.padding);
      bind("paddingLeft", refs.padding);
    }
  }
  async function opCreateVariable(params) {
    const name = params.name;
    const type = params.type;
    if (typeof name !== "string" || !name) throw withCode(new Error("CREATE_VARIABLE requires params.name"), "E_INVALID_ARGS");
    if (!VARIABLE_TYPES.includes(type)) {
      throw withCode(new Error(`CREATE_VARIABLE type must be one of ${VARIABLE_TYPES.join("|")}`), "E_INVALID_ARGS");
    }
    let value = params.value;
    if (type === "COLOR" && typeof value === "string") value = hexToFigmaColor(value);
    if (type === "COLOR" && typeof value === "object" && value !== null) {
      const c = value;
      value = { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
    }
    if (type === "FLOAT") value = Number(value);
    if (type === "BOOLEAN" && typeof value === "string") value = value === "true";
    if (value === void 0 || type === "FLOAT" && Number.isNaN(value)) {
      throw withCode(new Error("CREATE_VARIABLE requires a params.value matching the type"), "E_INVALID_ARGS");
    }
    const collection = await findOrCreateCollection(typeof params.collection === "string" && params.collection ? params.collection : COLLECTION_NAME);
    const { variable, reused } = await createOrReuseVariable(collection, name, type, value);
    if (typeof params.mode === "string") {
      const mode = collection.modes.find((m) => m.name === params.mode);
      if (mode) variable.setValueForMode(mode.modeId, value);
    }
    return { id: variable.id, name: variable.name, reused };
  }
  async function resolveVariable(ref) {
    if (ref.startsWith("VariableID:")) {
      const byId = await figma.variables.getVariableByIdAsync(ref);
      if (byId) return byId;
    }
    const all = await figma.variables.getLocalVariablesAsync();
    const byName = all.find((v) => v.name === ref);
    if (!byName) throw withCode(new Error(`variable not found: ${ref}`), "E_INVALID_ARGS");
    return byName;
  }
  async function opBindVariable(params) {
    const nodeId = params.nodeId ?? params.node;
    const field = params.field;
    const ref = params.variable;
    if (typeof nodeId !== "string" || typeof field !== "string" || typeof ref !== "string") {
      throw withCode(new Error("BIND_VARIABLE requires params.node, params.field, params.variable"), "E_INVALID_ARGS");
    }
    if (!BINDABLE_FIELDS.includes(field)) {
      throw withCode(new Error(`BIND_VARIABLE field must be one of ${BINDABLE_FIELDS.join("|")}`), "E_INVALID_ARGS");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      throw withCode(new Error(`node not found: ${nodeId}`), "E_INVALID_ARGS");
    }
    const variable = await resolveVariable(ref);
    bindVariableToField(node, field, variable);
    return { id: node.id, field, variable: variable.name };
  }

  // plugin/src/main/executor-keyed-vars.ts
  var resolvedByKey = /* @__PURE__ */ new Map();
  var localByKey = null;
  function resetKeyedVariableCache() {
    resolvedByKey.clear();
    localByKey = null;
  }
  async function readLocalVariablesByKey() {
    if (localByKey) return localByKey;
    const map = /* @__PURE__ */ new Map();
    try {
      for (const v of await figma.variables.getLocalVariablesAsync()) {
        if (typeof v.key === "string" && v.key) map.set(v.key, v);
      }
    } catch {
    }
    localByKey = map;
    return map;
  }
  async function resolveByKey(key) {
    const cached = resolvedByKey.get(key);
    if (cached !== void 0) return cached;
    let variable = (await readLocalVariablesByKey()).get(key) ?? null;
    if (!variable) {
      try {
        variable = await figma.variables.importVariableByKeyAsync(key);
      } catch (err) {
        pushImportWarning(`variable resolve failed for key ${key}: not local, and import failed: ${String(err)}`);
      }
    }
    resolvedByKey.set(key, variable);
    return variable;
  }
  async function applyKeyedBindings(node, bindings) {
    for (const [field, ref] of Object.entries(bindings)) {
      if (!ref || typeof ref.key !== "string" || !ref.key) continue;
      const variable = await resolveByKey(ref.key);
      if (!variable) {
        pushImportWarning(`keyed bind ${field}\u2192${ref.name ?? ref.key} skipped on "${node.name}": key not resolvable \u2014 literal value kept`);
        continue;
      }
      try {
        bindVariableToField(node, field, variable);
      } catch (err) {
        pushImportWarning(`keyed bind ${field}\u2192${ref.name ?? ref.key} failed on "${node.name}": ${String(err)}`);
      }
    }
  }

  // plugin/src/main/executor-token-var-resolve.ts
  function tokensAreEmpty(tokens) {
    return !(tokens.colors?.length || tokens.spacing?.length || tokens.radii?.length);
  }
  async function readLocalVariableMap() {
    const byName = /* @__PURE__ */ new Map();
    try {
      for (const v of await figma.variables.getLocalVariablesAsync()) {
        if (!byName.has(v.name)) byName.set(v.name, v);
      }
    } catch (err) {
      pushImportWarning(`local variable lookup failed \u2014 tokenRefs left unbound: ${String(err)}`);
    }
    return byName;
  }
  async function resolveTokenVars(tokens) {
    const resolved = await readLocalVariableMap();
    if (tokensAreEmpty(tokens)) return resolved;
    for (const [name, variable] of await createVariablesFromTokens(tokens)) {
      resolved.set(name, variable);
    }
    return resolved;
  }

  // plugin/src/main/executor-text.ts
  async function createTextNode(exportNode, tokenVars) {
    const textNode = figma.createText();
    textNode.name = specNodeName(exportNode);
    const family = exportNode.fontFamily || "Inter";
    const weight = exportNode.fontWeight || 400;
    const isItalic = exportNode.fontStyle === "italic";
    const loadedFont = await loadBestFont(family, weight, isItalic, exportNode.fontStack);
    textNode.fontName = loadedFont;
    textNode.characters = exportNode.characters || "";
    textNode.fontSize = exportNode.fontSize || 16;
    if (exportNode.lineHeight) {
      textNode.lineHeight = { value: exportNode.lineHeight, unit: "PIXELS" };
    }
    if (exportNode.letterSpacing) {
      textNode.letterSpacing = { value: exportNode.letterSpacing, unit: "PIXELS" };
    }
    if (exportNode.textAlignHorizontal) {
      textNode.textAlignHorizontal = exportNode.textAlignHorizontal;
    }
    if (exportNode.textColor) {
      textNode.fills = [{
        type: "SOLID",
        color: rgbToFigma(exportNode.textColor),
        opacity: exportNode.textColor.a
      }];
    }
    if (exportNode.opacity !== void 0 && exportNode.opacity > 0) {
      textNode.opacity = exportNode.opacity;
    }
    if (exportNode.textAutoResize) {
      textNode.textAutoResize = exportNode.textAutoResize;
    }
    if (exportNode.textTruncation === "ENDING") {
      try {
        textNode.textTruncation = "ENDING";
      } catch {
      }
    }
    if (exportNode.textDecoration) {
      textNode.textDecoration = exportNode.textDecoration;
    }
    if (exportNode.textCase) {
      textNode.textCase = exportNode.textCase;
    }
    if (exportNode.textSegments && exportNode.textSegments.length > 1) {
      let offset = 0;
      for (const seg of exportNode.textSegments) {
        const start = offset;
        const end = offset + seg.characters.length;
        if (start >= end || end > textNode.characters.length) {
          offset = end;
          continue;
        }
        try {
          const segFamily = seg.fontFamily || family;
          const segWeight = seg.fontWeight || weight;
          const segFont = await loadBestFont(segFamily, segWeight, seg.fontStyle === "italic");
          textNode.setRangeFontName(start, end, segFont);
          if (seg.fontSize && seg.fontSize !== (exportNode.fontSize || 16)) {
            textNode.setRangeFontSize(start, end, seg.fontSize);
          }
          if (seg.lineHeight) {
            textNode.setRangeLineHeight(start, end, { value: seg.lineHeight, unit: "PIXELS" });
          }
          if (seg.letterSpacing) {
            textNode.setRangeLetterSpacing(start, end, { value: seg.letterSpacing, unit: "PIXELS" });
          }
          if (seg.textColor) {
            textNode.setRangeFills(start, end, [{
              type: "SOLID",
              color: rgbToFigma(seg.textColor),
              opacity: seg.textColor.a
            }]);
          }
          if (seg.textDecoration) {
            textNode.setRangeTextDecoration(start, end, seg.textDecoration);
          }
          if (seg.textCase) {
            textNode.setRangeTextCase(start, end, seg.textCase);
          }
        } catch {
        }
        offset = end;
      }
    }
    if (exportNode.width && exportNode.height && exportNode.textAutoResize !== "WIDTH_AND_HEIGHT") {
      try {
        if (exportNode.textAutoResize === "HEIGHT") {
          textNode.resize(exportNode.width, textNode.height);
        } else {
          textNode.resize(exportNode.width, exportNode.height);
        }
      } catch {
      }
    }
    if (exportNode.tokenRefs) {
      applyTokenRefs(textNode, exportNode.tokenRefs, tokenVars ?? /* @__PURE__ */ new Map());
    }
    return textNode;
  }

  // plugin/src/main/executor-strokes.ts
  var SIDE_FIELDS = {
    top: "strokeTopWeight",
    right: "strokeRightWeight",
    bottom: "strokeBottomWeight",
    left: "strokeLeftWeight"
  };
  function applyStrokes(node, spec) {
    if (!spec.strokes || spec.strokes.length === 0) return;
    node.strokes = spec.strokes.filter((s) => s.color).map((s) => ({
      type: "SOLID",
      color: rgbToFigma(s.color),
      opacity: s.color.a
    }));
    if (spec.strokeWeights) {
      const target = node;
      for (const [side, field] of Object.entries(SIDE_FIELDS)) {
        const w = spec.strokeWeights[side];
        try {
          target[field] = w;
        } catch {
        }
      }
    } else if (spec.strokeWeight !== void 0) {
      node.strokeWeight = spec.strokeWeight;
    } else {
      node.strokeWeight = 1;
    }
    if (spec.strokeAlign) node.strokeAlign = spec.strokeAlign;
  }

  // plugin/src/main/executor-shapes.ts
  var PLACEHOLDER_FILL = { type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 }, opacity: 1 };
  async function createRectangleNode(exportNode, colorStyles, tokenVars) {
    const rect = figma.createRectangle();
    rect.name = specNodeName(exportNode);
    if (exportNode.width) rect.resize(exportNode.width, exportNode.height || exportNode.width);
    if (exportNode.fills && exportNode.fills.length > 0) {
      const fill = exportNode.fills[0];
      if (fill.color) {
        const hex = figmaColorToHex(fill.color);
        const paintStyle = colorStyles.get(hex);
        if (paintStyle) {
          await rect.setFillStyleIdAsync(paintStyle.id);
        } else {
          rect.fills = [{
            type: "SOLID",
            color: rgbToFigma(fill.color),
            opacity: fill.color.a
          }];
        }
      }
    }
    if (exportNode.cornerRadius !== void 0) {
      rect.cornerRadius = exportNode.cornerRadius;
    } else if (exportNode.cornerRadii) {
      rect.topLeftRadius = exportNode.cornerRadii.tl;
      rect.topRightRadius = exportNode.cornerRadii.tr;
      rect.bottomRightRadius = exportNode.cornerRadii.br;
      rect.bottomLeftRadius = exportNode.cornerRadii.bl;
    }
    if (exportNode.effects) {
      rect.effects = mapExportEffects(exportNode.effects);
    }
    applyStrokes(rect, exportNode);
    if (exportNode.opacity !== void 0 && exportNode.opacity > 0) {
      rect.opacity = exportNode.opacity;
    }
    if (exportNode.tokenRefs) {
      applyTokenRefs(rect, exportNode.tokenRefs, tokenVars ?? /* @__PURE__ */ new Map());
    }
    return rect;
  }
  function createImageNode(exportNode) {
    const rect = figma.createRectangle();
    rect.name = specNodeName(exportNode);
    rect.resize(exportNode.width || 200, exportNode.height || 200);
    rect.fills = [PLACEHOLDER_FILL];
    rect.cornerRadius = exportNode.cornerRadius || 0;
    return rect;
  }
  function createSvgNode(exportNode) {
    try {
      const frame = figma.createNodeFromSvg(exportNode.svgContent);
      frame.name = specNodeName(exportNode);
      const w = exportNode.width || 24;
      const h = exportNode.height || 24;
      frame.resize(w, h);
      return frame;
    } catch (err) {
      pushImportWarning(`svg import failed for "${exportNode.name}": ${String(err)}`);
      return createImageNode(exportNode);
    }
  }
  async function createImageNodeWithFetch(exportNode) {
    const rect = figma.createRectangle();
    rect.name = specNodeName(exportNode);
    rect.resize(exportNode.width || 200, exportNode.height || 200);
    rect.cornerRadius = exportNode.cornerRadius || 0;
    const url = exportNode.imageUrl || "";
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
      if (url.startsWith("data:")) {
        try {
          const image = figma.createImage(decodeDataUrl(url));
          rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
          return rect;
        } catch {
        }
      }
      rect.fills = [PLACEHOLDER_FILL];
      return rect;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const image = await createImageFromBytes(new Uint8Array(buffer), url);
      rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
    } catch (err) {
      pushImportWarning(`image fetch failed for "${exportNode.name}" (${url}): ${String(err)}`);
      rect.fills = [PLACEHOLDER_FILL];
    }
    return rect;
  }
  function decodeDataUrl(url) {
    const comma = url.indexOf(",");
    const b64 = url.slice(comma + 1);
    return figma.base64Decode(b64);
  }
  async function createImageFromBytes(bytes, url) {
    try {
      return figma.createImage(bytes);
    } catch (err) {
      if (url && /^https?:/i.test(url)) return await figma.createImageAsync(url);
      throw err;
    }
  }
  async function resolveImagePaint(url, scaleMode = "FILL") {
    if (!url || url.startsWith("blob:")) return null;
    try {
      let image;
      if (url.startsWith("data:")) {
        image = await createImageFromBytes(decodeDataUrl(url), void 0);
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        image = await createImageFromBytes(new Uint8Array(buffer), url);
      }
      return { type: "IMAGE", imageHash: image.hash, scaleMode };
    } catch (err) {
      if (/^https?:/i.test(url)) {
        try {
          const image = await figma.createImageAsync(url);
          return { type: "IMAGE", imageHash: image.hash, scaleMode };
        } catch {
        }
      }
      pushImportWarning(`background image fetch failed (${url}): ${String(err)}`);
      return null;
    }
  }

  // plugin/src/main/scan-node-utils.ts
  function safe(read) {
    try {
      const v = read();
      if (typeof v === "symbol") return void 0;
      return v;
    } catch {
      return void 0;
    }
  }

  // plugin/src/main/instance-inner-override-keys.ts
  var INNER_OVERRIDE_FIELDS = [
    "name",
    "width",
    "height",
    "layoutGrow",
    "textAutoResize",
    "primaryAxisSizingMode",
    "counterAxisSizingMode"
  ];
  var FIELD_SET = new Set(INNER_OVERRIDE_FIELDS);
  function innerChildKey(instanceId, nodeId) {
    const prefix = `I${instanceId};`;
    return nodeId.startsWith(prefix) && nodeId.length > prefix.length ? nodeId.slice(prefix.length) : void 0;
  }
  function keyInnerChildren(instance, instanceId, maxNodes = 2e3) {
    const map = /* @__PURE__ */ new Map();
    const visit = (node) => {
      if (map.size >= maxNodes) return;
      const kids = safe(() => node.children);
      if (!Array.isArray(kids)) return;
      for (const kid of kids) {
        const id = safe(() => kid.id);
        if (typeof id === "string") {
          const key = innerChildKey(instanceId, id);
          if (key !== void 0) map.set(key, kid);
        }
        visit(kid);
      }
    };
    visit(instance);
    return map;
  }

  // plugin/src/main/executor-instance-inner-overrides.ts
  var SIDE_EFFECT_FIELDS = ["primaryAxisSizingMode", "counterAxisSizingMode", "textAutoResize"];
  function writeField(child, name, field, value) {
    try {
      child[field] = value;
    } catch (err) {
      pushImportWarning(`instance "${name}": inner override ${field} failed (${String(err)})`);
    }
  }
  function applyChildFields(child, fields, name) {
    const before = {};
    for (const f of SIDE_EFFECT_FIELDS) before[f] = safe(() => child[f]);
    if (typeof fields.name === "string") writeField(child, name, "name", fields.name);
    const w = fields.width;
    const h = fields.height;
    if (typeof w === "number" || typeof h === "number") {
      try {
        const resize = child.resize;
        const cw = typeof w === "number" ? w : child.width;
        const ch = typeof h === "number" ? h : child.height;
        if (typeof resize === "function") resize.call(child, cw, ch);
      } catch (err) {
        pushImportWarning(`instance "${name}": inner override resize failed (${String(err)})`);
      }
    }
    for (const f of SIDE_EFFECT_FIELDS) {
      const wanted = f in fields ? fields[f] : before[f];
      if (wanted === void 0) continue;
      try {
        if (child[f] !== wanted) child[f] = wanted;
      } catch {
        if (f in fields) pushImportWarning(`instance "${name}": inner override ${f} failed`);
      }
    }
    if (typeof fields.layoutGrow === "number") writeField(child, name, "layoutGrow", fields.layoutGrow);
  }
  function applyInnerOverrides(instance, spec) {
    const overrides = spec.innerOverrides;
    if (!overrides || !overrides.length) return;
    const byKey = keyInnerChildren(instance, instance.id);
    const missed = [];
    for (const o of overrides) {
      const child = byKey.get(o.childKey);
      if (!child) {
        missed.push(o.childKey);
        continue;
      }
      applyChildFields(child, o.fields, spec.name);
    }
    if (missed.length) {
      pushImportWarning(
        `instance "${spec.name}": ${missed.length} inner override(s) had no matching child (${missed.join(", ")}) \u2014 those inner edits are lost`
      );
    }
  }

  // plugin/src/main/executor-instance.ts
  async function resolveMainComponent(spec) {
    if (spec.componentKey) {
      try {
        return await figma.importComponentByKeyAsync(spec.componentKey);
      } catch {
      }
    }
    if (spec.componentId) {
      try {
        const local = await figma.getNodeByIdAsync(spec.componentId);
        if (local && local.type === "COMPONENT") return local;
        if (local && local.type === "COMPONENT_SET") return local.defaultVariant;
      } catch {
      }
    }
    return null;
  }
  function applyComponentProperties(instance, spec) {
    if (!spec.componentProperties || Object.keys(spec.componentProperties).length === 0) return;
    try {
      instance.setProperties(spec.componentProperties);
    } catch (err) {
      pushImportWarning(`instance "${spec.name}": setProperties failed \u2014 built with main defaults (${String(err)})`);
    }
  }
  function fillsDiffer(current, wanted) {
    if (typeof current === "symbol") return true;
    return JSON.stringify(current) !== JSON.stringify(wanted);
  }
  function applyNodeOverrides(instance, spec) {
    if (spec.name && instance.name !== spec.name) {
      try {
        instance.name = spec.name;
      } catch {
      }
    }
    if (spec.width && spec.height && (Math.abs(instance.width - spec.width) > 0.01 || Math.abs(instance.height - spec.height) > 0.01)) {
      try {
        instance.resize(spec.width, spec.height);
      } catch (err) {
        pushImportWarning(`instance "${spec.name}": resize failed (${String(err)})`);
      }
    }
    if (spec.fills && spec.fills.length) {
      const paints = spec.fills.map(exportFillToPaint).filter((p) => p !== null);
      if (paints.length && fillsDiffer(instance.fills, paints)) {
        try {
          instance.fills = paints;
        } catch {
        }
      }
    }
    if (spec.cornerRadius !== void 0 && instance.cornerRadius !== spec.cornerRadius) {
      try {
        instance.cornerRadius = spec.cornerRadius;
      } catch {
      }
    } else if (spec.cornerRadii) {
      try {
        instance.topLeftRadius = spec.cornerRadii.tl;
        instance.topRightRadius = spec.cornerRadii.tr;
        instance.bottomRightRadius = spec.cornerRadii.br;
        instance.bottomLeftRadius = spec.cornerRadii.bl;
      } catch {
      }
    }
    if (spec.opacity !== void 0 && spec.opacity > 0 && instance.opacity !== spec.opacity) {
      try {
        instance.opacity = spec.opacity;
      } catch {
      }
    }
    if (spec.effects && spec.effects.length) {
      try {
        instance.effects = mapExportEffects(spec.effects);
      } catch {
      }
    }
  }
  async function createInstanceNode(spec, frameFallback) {
    const main = await resolveMainComponent(spec);
    if (!main) {
      pushImportWarning(
        `instance "${spec.name}": main component not found (key=${spec.componentKey ?? "\u2014"}, id=${spec.componentId ?? "\u2014"}) \u2014 rebuilt as a plain frame, component link lost`
      );
      return frameFallback(spec);
    }
    let instance;
    try {
      instance = main.createInstance();
    } catch (err) {
      pushImportWarning(`instance "${spec.name}": createInstance failed \u2014 rebuilt as a plain frame (${String(err)})`);
      return frameFallback(spec);
    }
    applyComponentProperties(instance, spec);
    applyNodeOverrides(instance, spec);
    applyInnerOverrides(instance, spec);
    return instance;
  }

  // plugin/src/main/background-fill.ts
  function backgroundSizeToScaleMode(bgSize) {
    const s = (bgSize || "").trim().toLowerCase();
    if (!s || s === "auto") return "FILL";
    if (s === "cover") return "FILL";
    if (s === "contain") return "FIT";
    if (s.includes("repeat")) return "TILE";
    return "FILL";
  }

  // plugin/src/main/executor-motion.ts
  function mapCssEasingToMotion(css) {
    const c = (css || "").trim().toLowerCase();
    const bez = c.match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
    if (bez) {
      return {
        type: "CUSTOM_CUBIC_BEZIER",
        easingFunctionCubicBezier: {
          x1: parseFloat(bez[1]),
          y1: parseFloat(bez[2]),
          x2: parseFloat(bez[3]),
          y2: parseFloat(bez[4])
        }
      };
    }
    switch (c) {
      case "linear":
        return { type: "LINEAR" };
      case "ease-in":
        return { type: "EASE_IN" };
      case "ease-out":
        return { type: "EASE_OUT" };
      case "ease-in-out":
        return { type: "EASE_IN_AND_OUT" };
      case "ease":
      default:
        return { type: "EASE_IN_AND_OUT" };
    }
  }
  function parseTransform(transform) {
    const out = {};
    const t = (transform || "").trim();
    if (!t) return out;
    if (t === "none") {
      out.translateX = 0;
      out.translateY = 0;
      out.rotate = 0;
      out.scaleX = 1;
      out.scaleY = 1;
      return out;
    }
    const num = (v) => parseFloat(v);
    let m;
    if (m = t.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/)) {
      out.translateX = num(m[1]);
      out.translateY = num(m[2]);
    }
    if (m = t.match(/translate\(\s*([-\d.]+)px\s*\)/)) out.translateX = num(m[1]);
    if (m = t.match(/translateX\(\s*([-\d.]+)px\s*\)/)) out.translateX = num(m[1]);
    if (m = t.match(/translateY\(\s*([-\d.]+)px\s*\)/)) out.translateY = num(m[1]);
    if (m = t.match(/rotate\(\s*([-\d.]+)deg\s*\)/)) out.rotate = num(m[1]);
    if (m = t.match(/scale\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/)) {
      out.scaleX = num(m[1]);
      out.scaleY = num(m[2]);
    } else if (m = t.match(/scale\(\s*([-\d.]+)\s*\)/)) {
      out.scaleX = num(m[1]);
      out.scaleY = num(m[1]);
    }
    if (m = t.match(/scaleX\(\s*([-\d.]+)\s*\)/)) out.scaleX = num(m[1]);
    if (m = t.match(/scaleY\(\s*([-\d.]+)\s*\)/)) out.scaleY = num(m[1]);
    return out;
  }
  var FIELD_EXTRACTORS = [
    { name: "OPACITY", get: (s) => s.opacity !== void 0 && s.opacity !== "" ? parseFloat(s.opacity) : void 0 },
    { name: "TRANSLATION_X", get: (s) => parseTransform(s.transform).translateX },
    { name: "TRANSLATION_Y", get: (s) => parseTransform(s.transform).translateY },
    { name: "ROTATION", get: (s) => parseTransform(s.transform).rotate },
    { name: "SCALE_X", get: (s) => parseTransform(s.transform).scaleX },
    { name: "SCALE_Y", get: (s) => parseTransform(s.transform).scaleY }
  ];
  function buildMotionTracks(steps, durationSec, cssEasing) {
    if (!steps.length || durationSec <= 0) return [];
    const sorted = [...steps].sort((a, b) => a.offset - b.offset);
    const easing = mapCssEasingToMotion(cssEasing);
    const specs = [];
    for (const { name, get } of FIELD_EXTRACTORS) {
      const points = [];
      for (const step of sorted) {
        const v = get(step.style);
        if (v !== void 0 && !Number.isNaN(v)) points.push({ offset: step.offset, value: v });
      }
      if (points.length < 2) continue;
      const distinct = new Set(points.map((p) => p.value));
      if (distinct.size < 2) continue;
      const keyframes = points.map((p) => ({
        timelinePosition: Math.round(p.offset * durationSec * 1e3) / 1e3,
        value: { type: "FLOAT", value: p.value },
        easing
      }));
      specs.push({
        field: { type: "PROPERTY", name },
        // Omit baseValue for a NEW track — the Motion API derives it from the node
        // (per the official figma-use-motion skill; API shape validated live 2026-07-09).
        track: { keyframes }
      });
    }
    return specs;
  }
  var motionProbe = null;
  function isMotionSupported(node) {
    if (motionProbe !== null) return motionProbe;
    try {
      const n = node;
      const api = figma.motion;
      motionProbe = typeof n.applyManualKeyframeTrack === "function" && typeof api?.figmaAnimationStyles === "function";
    } catch {
      motionProbe = false;
    }
    return motionProbe;
  }
  function applyMotionTracks(node, steps, durationSec, cssEasing) {
    if (!isMotionSupported(node)) {
      pushImportWarning("Figma Motion API unavailable (metronome) \u2014 falling back to Smart-Animate variants");
      return { applied: false, reason: "unsupported", trackCount: 0 };
    }
    const specs = buildMotionTracks(steps, durationSec, cssEasing);
    if (!specs.length) return { applied: false, reason: "no-animatable-fields", trackCount: 0 };
    const n = node;
    for (const { field, track } of specs) {
      try {
        n.applyManualKeyframeTrack(field, track);
      } catch (err) {
        pushImportWarning(`Motion track ${JSON.stringify(field)} failed: ${String(err)}`);
      }
    }
    try {
      const tl = n.timelines?.[0];
      if (tl) n.setTimelineDuration(tl.id, durationSec);
    } catch {
    }
    return { applied: true, trackCount: specs.length };
  }

  // plugin/src/main/executor-frame.ts
  async function createFigmaNode(exportNode, colorStyles, tokenVars) {
    let node;
    switch (exportNode.type) {
      case "TEXT":
        node = await createTextNode(exportNode, tokenVars);
        break;
      case "IMAGE":
        node = exportNode.svgContent ? createSvgNode(exportNode) : exportNode.imageUrl ? await createImageNodeWithFetch(exportNode) : createImageNode(exportNode);
        break;
      case "RECTANGLE":
        node = await createRectangleNode(exportNode, colorStyles, tokenVars);
        break;
      case "INSTANCE":
        node = await createInstanceNode(exportNode, (spec) => createFrameNode(spec, colorStyles, tokenVars));
        break;
      case "FRAME":
      case "GROUP":
      default:
        node = await createFrameNode(exportNode, colorStyles, tokenVars);
        break;
    }
    if (node && exportNode.keyedBindings) {
      await applyKeyedBindings(node, exportNode.keyedBindings);
    }
    if (node && exportNode.motion && exportNode.motion.steps && exportNode.motion.steps.length >= 2) {
      applyMotionTracks(node, exportNode.motion.steps, exportNode.motion.durationSec, exportNode.motion.easing);
    }
    return node;
  }
  function applyGridLayout(frame, spec, applied) {
    const f = frame;
    try {
      f.layoutMode = "GRID";
      if (f.layoutMode !== "GRID") throw new Error("GRID layoutMode not supported by this Figma version");
      if (spec.gridRowCount) f.gridRowCount = spec.gridRowCount;
      if (spec.gridColumnCount) f.gridColumnCount = spec.gridColumnCount;
      if (spec.gridRowGap !== void 0) f.gridRowGap = spec.gridRowGap;
      if (spec.gridColumnGap !== void 0) f.gridColumnGap = spec.gridColumnGap;
      applied.layoutMode = "GRID";
      applied.gridRowCount = f.gridRowCount;
      applied.gridColumnCount = f.gridColumnCount;
    } catch (err) {
      frame.layoutMode = "HORIZONTAL";
      frame.layoutWrap = "WRAP";
      frame.itemSpacing = spec.gridColumnGap ?? spec.itemSpacing ?? 0;
      try {
        frame.counterAxisSpacing = spec.gridRowGap ?? spec.counterAxisSpacing ?? 0;
      } catch {
      }
      pushImportWarning(`native GRID unavailable on "${frame.name}" \u2014 fell back to HORIZONTAL+WRAP (${String(err)})`);
      applied.layoutMode = "HORIZONTAL_WRAP_FALLBACK";
    }
  }
  function applyAutoLayout(frame, spec, useDefaults) {
    const applied = {};
    const mode = spec.layoutMode;
    if (!mode) return applied;
    if (mode === "NONE") {
      frame.layoutMode = "NONE";
      applied.layoutMode = "NONE";
      return applied;
    }
    if (mode === "GRID") {
      applyGridLayout(frame, spec, applied);
    } else {
      frame.layoutMode = mode;
      applied.layoutMode = mode;
      if (useDefaults || spec.itemSpacing !== void 0) frame.itemSpacing = spec.itemSpacing ?? 0;
      if (spec.primaryAxisSizingMode) frame.primaryAxisSizingMode = spec.primaryAxisSizingMode === "AUTO" ? "AUTO" : "FIXED";
      if (spec.counterAxisSizingMode) frame.counterAxisSizingMode = spec.counterAxisSizingMode === "AUTO" ? "AUTO" : "FIXED";
      if (spec.primaryAxisAlignItems) frame.primaryAxisAlignItems = spec.primaryAxisAlignItems;
      if (spec.counterAxisAlignItems) frame.counterAxisAlignItems = spec.counterAxisAlignItems;
      if (spec.layoutWrap === "WRAP" && frame.layoutMode === "HORIZONTAL") frame.layoutWrap = "WRAP";
      if (spec.counterAxisSpacing !== void 0 && frame.layoutWrap === "WRAP") {
        try {
          frame.counterAxisSpacing = spec.counterAxisSpacing;
        } catch {
        }
      }
    }
    if (useDefaults || spec.paddingTop !== void 0) frame.paddingTop = spec.paddingTop ?? 0;
    if (useDefaults || spec.paddingRight !== void 0) frame.paddingRight = spec.paddingRight ?? 0;
    if (useDefaults || spec.paddingBottom !== void 0) frame.paddingBottom = spec.paddingBottom ?? 0;
    if (useDefaults || spec.paddingLeft !== void 0) frame.paddingLeft = spec.paddingLeft ?? 0;
    if (!useDefaults && spec.layoutSizingHorizontal) {
      try {
        frame.layoutSizingHorizontal = spec.layoutSizingHorizontal;
        applied.layoutSizingHorizontal = spec.layoutSizingHorizontal;
      } catch {
      }
    }
    if (!useDefaults && spec.layoutSizingVertical) {
      try {
        frame.layoutSizingVertical = spec.layoutSizingVertical;
        applied.layoutSizingVertical = spec.layoutSizingVertical;
      } catch {
      }
    }
    return applied;
  }
  function reassertAxisSizing(frame, spec) {
    if (!spec.layoutMode || spec.layoutMode === "NONE" || spec.layoutMode === "GRID") return;
    if (frame.layoutMode === "NONE") return;
    if (spec.primaryAxisSizingMode) {
      try {
        frame.primaryAxisSizingMode = spec.primaryAxisSizingMode;
      } catch {
      }
    }
    if (spec.counterAxisSizingMode) {
      try {
        frame.counterAxisSizingMode = spec.counterAxisSizingMode;
      } catch {
      }
    }
  }
  function applyChildSizingHints(frame, childNode, childExport) {
    if (frame.layoutMode === "NONE") return;
    const child = childNode;
    try {
      if (childExport.layoutSizingHorizontal) {
        child.layoutSizingHorizontal = childExport.layoutSizingHorizontal;
      } else if (frame.layoutMode === "VERTICAL") {
        if (childExport.type === "FRAME" || childExport.type === "GROUP" || childExport.type === "RECTANGLE") {
          child.layoutSizingHorizontal = "FILL";
        } else if (childExport.type === "TEXT") {
          child.layoutSizingHorizontal = childExport.textAutoResize === "HEIGHT" ? "FIXED" : "HUG";
        }
      }
    } catch {
    }
    try {
      if (childExport.layoutSizingVertical) child.layoutSizingVertical = childExport.layoutSizingVertical;
    } catch {
    }
    try {
      if (childExport.type === "TEXT" && childExport.textAutoResize && childNode.textAutoResize !== childExport.textAutoResize) {
        childNode.textAutoResize = childExport.textAutoResize;
      }
    } catch {
    }
    try {
      if (childExport.layoutGrow && childExport.layoutGrow > 0) child.layoutGrow = childExport.layoutGrow;
    } catch {
    }
  }
  async function createFrameNode(exportNode, colorStyles, tokenVars) {
    const frame = figma.createFrame();
    frame.name = specNodeName(exportNode);
    if (exportNode.layoutMode && exportNode.layoutMode !== "NONE") {
      applyAutoLayout(frame, exportNode, true);
    }
    if (exportNode.width) {
      const h = exportNode.height || 100;
      frame.resize(exportNode.width, h);
      reassertAxisSizing(frame, exportNode);
    }
    const hasBgImage = !!exportNode.backgroundImageUrl;
    if (exportNode.fills && exportNode.fills.length > 0 || hasBgImage) {
      const figmaFills = [];
      let usedPaintStyle = false;
      for (const fill of exportNode.fills ?? []) {
        const paint = exportFillToPaint(fill);
        if (!paint) continue;
        const paintStyle = paint.type === "SOLID" ? colorStyles.get(figmaColorToHex(fill.color)) : void 0;
        if (paintStyle && !hasBgImage) {
          await frame.setFillStyleIdAsync(paintStyle.id);
          usedPaintStyle = true;
        } else {
          figmaFills.push(paint);
        }
      }
      if (hasBgImage) {
        const scaleMode = backgroundSizeToScaleMode(exportNode.backgroundSize);
        const imgPaint = await resolveImagePaint(exportNode.backgroundImageUrl, scaleMode);
        if (imgPaint) figmaFills.push(imgPaint);
      }
      if (figmaFills.length > 0) frame.fills = figmaFills;
      else if (!usedPaintStyle) frame.fills = [];
    } else {
      frame.fills = [];
    }
    if (exportNode.cornerRadius !== void 0) {
      frame.cornerRadius = exportNode.cornerRadius;
    } else if (exportNode.cornerRadii) {
      frame.topLeftRadius = exportNode.cornerRadii.tl;
      frame.topRightRadius = exportNode.cornerRadii.tr;
      frame.bottomRightRadius = exportNode.cornerRadii.br;
      frame.bottomLeftRadius = exportNode.cornerRadii.bl;
    }
    if (exportNode.effects) frame.effects = mapExportEffects(exportNode.effects);
    if (exportNode.rotation) frame.rotation = exportNode.rotation;
    if (exportNode.blendMode) {
      try {
        frame.blendMode = exportNode.blendMode;
      } catch {
      }
    }
    if (exportNode.counterAxisAlignContent) {
      try {
        frame.counterAxisAlignContent = exportNode.counterAxisAlignContent;
      } catch {
      }
    }
    applyStrokes(frame, exportNode);
    if (exportNode.opacity !== void 0 && exportNode.opacity > 0) {
      frame.opacity = exportNode.opacity;
    }
    try {
      if (exportNode.maxWidth) frame.maxWidth = exportNode.maxWidth;
      if (exportNode.minWidth) frame.minWidth = exportNode.minWidth;
      if (exportNode.maxHeight) frame.maxHeight = exportNode.maxHeight;
      if (exportNode.minHeight) frame.minHeight = exportNode.minHeight;
    } catch {
    }
    frame.clipsContent = !!exportNode.clipsContent;
    if (exportNode.tokenRefs) {
      applyTokenRefs(frame, exportNode.tokenRefs, tokenVars ?? /* @__PURE__ */ new Map());
    }
    if (exportNode.children) {
      for (const childExport of exportNode.children) {
        const childNode = await createFigmaNode(childExport, colorStyles, tokenVars);
        if (!childNode) continue;
        frame.appendChild(childNode);
        if (childExport.absolutePosition && childExport.x !== void 0 && childExport.y !== void 0) {
          try {
            if (frame.layoutMode !== "NONE" && "layoutPositioning" in childNode) {
              childNode.layoutPositioning = "ABSOLUTE";
            }
            childNode.x = childExport.x;
            childNode.y = childExport.y;
          } catch (err) {
            pushImportWarning(`absolute positioning failed on "${childNode.name}" \u2014 left in flow (${String(err)})`);
          }
          continue;
        }
        applyChildSizingHints(frame, childNode, childExport);
      }
    }
    reassertAxisSizing(frame, exportNode);
    return frame;
  }

  // plugin/src/main/serialize-node.ts
  function serializeNode(node, depth = 1) {
    const out = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: "x" in node ? Math.round(node.x * 100) / 100 : 0,
      y: "y" in node ? Math.round(node.y * 100) / 100 : 0,
      width: "width" in node ? Math.round(node.width * 100) / 100 : 0,
      height: "height" in node ? Math.round(node.height * 100) / 100 : 0
    };
    if (depth > 0 && "children" in node) {
      out.children = node.children.map((c) => serializeNode(c, depth - 1));
    }
    return out;
  }
  function jsonSafe(value) {
    if (value === void 0) return null;
    try {
      return JSON.parse(JSON.stringify(value, (_k, v) => {
        if (typeof v === "function") return "[Function]";
        if (typeof v === "bigint") return String(v);
        return v;
      }));
    } catch {
      return String(value);
    }
  }
  function safeStringify(v) {
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return String(v);
    }
  }
  async function serializeDesignSystem() {
    await figma.loadAllPagesAsync();
    const nodes = figma.root.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
    const components = [];
    for (const n of nodes) {
      if (n.type === "COMPONENT" && n.parent && n.parent.type === "COMPONENT_SET") continue;
      const entry = { id: n.id, key: n.key, name: n.name, type: n.type };
      try {
        const defs = n.componentPropertyDefinitions;
        const axes = {};
        for (const [prop, def] of Object.entries(defs)) {
          if (def.type === "VARIANT") axes[prop] = def.variantOptions ?? [];
        }
        if (Object.keys(axes).length > 0) entry.variantAxes = axes;
      } catch {
      }
      components.push(entry);
    }
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const collectionName = new Map(collections.map((c) => [c.id, c.name]));
    const defaultMode = new Map(collections.map((c) => [c.id, c.modes[0] ? c.modes[0].modeId : ""]));
    const tokens = variables.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.resolvedType,
      collection: collectionName.get(v.variableCollectionId) ?? v.variableCollectionId,
      value: jsonSafe(v.valuesByMode[defaultMode.get(v.variableCollectionId) ?? ""] ?? null)
    }));
    const paint = await figma.getLocalPaintStylesAsync();
    const text = await figma.getLocalTextStylesAsync();
    const effect = await figma.getLocalEffectStylesAsync();
    const styles = [
      ...paint.map((s) => ({ id: s.id, name: s.name, type: "PAINT" })),
      ...text.map((s) => ({ id: s.id, name: s.name, type: "TEXT" })),
      ...effect.map((s) => ({ id: s.id, name: s.name, type: "EFFECT" }))
    ];
    return {
      components,
      tokens,
      styles,
      counts: { components: components.length, tokens: tokens.length, styles: styles.length }
    };
  }

  // shared/audit-types.ts
  var AUDIT_FACTS_SCHEMA = 2;

  // plugin/src/main/executor-audit-units.ts
  var MAX_UNIT_NODES = 300;
  var MAX_UNIT_DEPTH = 10;
  var MAX_UNIT_TEXT = 2e3;
  var CAPPED = "\u2026capped";
  function hex2(c) {
    const v = Math.max(0, Math.min(255, Math.round(c * 255)));
    return v.toString(16).padStart(2, "0");
  }
  function paintFingerprint(prefix, p) {
    if (p.type === "SOLID") {
      const bound = p.boundVariables?.color;
      if (bound) return `${prefix}:var:${bound.id}`;
      let s = `${prefix}:#${hex2(p.color.r)}${hex2(p.color.g)}${hex2(p.color.b)}`;
      if (typeof p.opacity === "number" && p.opacity < 1) s += `@${p.opacity.toFixed(2)}`;
      return s;
    }
    return `${prefix}:${p.type}`;
  }
  function collectPaints(node, st) {
    for (const field of ["fills", "strokes"]) {
      if (!(field in node)) continue;
      let paints;
      try {
        paints = node[field];
      } catch {
        continue;
      }
      if (!Array.isArray(paints)) continue;
      const prefix = field === "fills" ? "f" : "s";
      for (const p of paints) st.paints.push(paintFingerprint(prefix, p));
    }
  }
  function walk(node, depth, isRoot, st) {
    if (st.cappedNodes) return;
    if (st.nodes >= MAX_UNIT_NODES) {
      st.structure.push(CAPPED);
      st.cappedNodes = true;
      return;
    }
    st.nodes++;
    let w = 0;
    let h = 0;
    try {
      w = Math.round(node.width);
      h = Math.round(node.height);
    } catch {
      w = 0;
      h = 0;
    }
    st.structure.push(`${depth}:${node.type}:${isRoot ? "" : node.name}:${w}x${h}`);
    if (node.type === "TEXT") {
      try {
        const chars = node.characters;
        if (!st.cappedText) {
          if (st.textLen + chars.length > MAX_UNIT_TEXT) {
            st.texts.push(CAPPED);
            st.cappedText = true;
          } else {
            st.texts.push(chars);
            st.textLen += chars.length;
          }
        }
      } catch {
      }
    }
    collectPaints(node, st);
    if (node.type === "INSTANCE") return;
    if (depth >= MAX_UNIT_DEPTH) return;
    if ("children" in node) {
      for (const child of node.children) {
        if (st.cappedNodes) break;
        walk(child, depth + 1, false, st);
      }
    }
  }
  function unitFact(node) {
    const st = {
      structure: [],
      texts: [],
      paints: [],
      nodes: 0,
      textLen: 0,
      cappedNodes: false,
      cappedText: false
    };
    walk(node, 0, true, st);
    return { id: node.id, name: node.name, structure: st.structure, texts: st.texts, paints: st.paints };
  }

  // plugin/src/main/executor-audit.ts
  function countUnboundPaints(node, field) {
    if (!(field in node)) return 0;
    let paints;
    try {
      paints = node[field];
    } catch {
      return 0;
    }
    if (!Array.isArray(paints)) return 0;
    let n = 0;
    for (const p of paints) {
      if (p.type === "SOLID" && !p.boundVariables?.color) n++;
    }
    return n;
  }
  async function getInstancesAsyncLength(node) {
    const fn = node.getInstancesAsync;
    if (typeof fn !== "function") return null;
    try {
      const instances = await fn.call(node);
      return Array.isArray(instances) ? instances.length : null;
    } catch {
      return null;
    }
  }
  async function factForNode(n, pageName) {
    let variantAxes = {};
    try {
      const defs = n.componentPropertyDefinitions;
      for (const [prop, def] of Object.entries(defs)) {
        if (def.type === "VARIANT") variantAxes[prop] = def.variantOptions ?? [];
      }
    } catch {
      variantAxes = {};
    }
    const variantCount = n.type === "COMPONENT_SET" ? n.children.length : 0;
    let section = null;
    let p = n.parent;
    while (p) {
      if (p.type === "SECTION") {
        section = p.name;
        break;
      }
      p = p.parent;
    }
    const deprecatedData = n.getSharedPluginData("idp", "status") === "deprecated";
    let width = 0;
    let height = 0;
    try {
      width = Math.round(n.width);
      height = Math.round(n.height);
    } catch {
      width = 0;
      height = 0;
    }
    const rep = n.type === "COMPONENT_SET" ? n.children[0] : n;
    const repChildren = rep && "children" in rep ? [...rep.children] : [];
    let unboundFills = 0;
    let unboundStrokes = 0;
    for (const s of rep ? [rep, ...repChildren] : []) {
      unboundFills += countUnboundPaints(s, "fills");
      unboundStrokes += countUnboundPaints(s, "strokes");
    }
    let units;
    if (n.type === "COMPONENT_SET") {
      units = [];
      for (const child of n.children) {
        units.push({ ...unitFact(child), usageCount: await getInstancesAsyncLength(child) });
      }
    } else {
      units = [{ ...unitFact(n), usageCount: null }];
    }
    return {
      id: n.id,
      key: n.key ?? null,
      name: n.name,
      type: n.type,
      variantCount,
      variantAxes,
      pageName,
      section,
      deprecatedData,
      width,
      height,
      unboundFills,
      unboundStrokes,
      units
    };
  }
  async function inventoryPage(page) {
    const nodes = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
    const facts = [];
    for (const n of nodes) {
      if (n.type === "COMPONENT" && n.parent && n.parent.type === "COMPONENT_SET") continue;
      facts.push(await factForNode(n, page.name));
    }
    return facts;
  }
  async function tallyUsagePage(page, usage) {
    var _a, _b;
    const cnt = {};
    const reps = {};
    page.findAll((node) => {
      var _a2;
      if (node.type === "INSTANCE") {
        cnt[node.name] = (cnt[node.name] ?? 0) + 1;
        reps[_a2 = node.name] ?? (reps[_a2] = node);
      }
      return false;
    });
    let tallied = 0;
    for (const name of Object.keys(reps)) {
      const c = cnt[name];
      tallied += c;
      let key = null;
      try {
        const main = await reps[name].getMainComponentAsync();
        if (main) key = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : main;
      } catch {
        key = null;
      }
      if (key) {
        usage.byMainId[key.id] = (usage.byMainId[key.id] ?? 0) + c;
        const pages = (_a = usage.pagesById)[_b = key.id] ?? (_a[_b] = []);
        if (!pages.includes(page.name)) pages.push(page.name);
      } else {
        usage.unresolved += c;
      }
    }
    return tallied;
  }
  async function auditDs() {
    const pages = figma.root.children;
    const components = [];
    const usage = { byMainId: {}, pagesById: {}, unresolved: 0 };
    const skippedPages = [];
    let instancesTallied = 0;
    for (const page of pages) {
      try {
        await figma.setCurrentPageAsync(page);
      } catch {
        skippedPages.push(page.name);
        continue;
      }
      components.push(...await inventoryPage(page));
      instancesTallied += await tallyUsagePage(page, usage);
    }
    const masters = components.length;
    const sets = components.filter((c) => c.type === "COMPONENT_SET").length;
    const variants = components.reduce((sum, c) => sum + c.variantCount, 0);
    return {
      schema: AUDIT_FACTS_SCHEMA,
      // Only plain objects survive past a page boundary (C5) — no SceneNode is retained.
      file: {
        fileName: figma.root.name,
        pages: pages.map((pg) => ({ id: pg.id, name: pg.name })),
        skippedPages
      },
      components,
      usage,
      counts: { masters, sets, standalone: masters - sets, variants, instancesTallied }
    };
  }

  // plugin/src/main/executor-ops.ts
  var PLUGIN_VERSION = "0.1.0";
  var LAYOUT_MODE_MAP = {
    H: "HORIZONTAL",
    V: "VERTICAL",
    HORIZONTAL: "HORIZONTAL",
    VERTICAL: "VERTICAL",
    GRID: "GRID",
    NONE: "NONE"
  };
  var NUM_PARAM_ALIASES = [
    ["itemSpacing", "gap", "itemSpacing"],
    ["counterAxisSpacing", "counterAxisSpacing"],
    ["gridRowCount", "rows", "gridRowCount"],
    ["gridColumnCount", "cols", "gridColumnCount"],
    ["gridRowGap", "rowGap", "gridRowGap"],
    ["gridColumnGap", "colGap", "gridColumnGap"],
    ["paddingTop", "paddingTop"],
    ["paddingRight", "paddingRight"],
    ["paddingBottom", "paddingBottom"],
    ["paddingLeft", "paddingLeft"]
  ];
  var STR_PARAM_ALIASES = [
    ["primaryAxisAlignItems", "alignPrimary"],
    ["counterAxisAlignItems", "alignCounter"],
    ["layoutSizingHorizontal", "sizingH"],
    ["layoutSizingVertical", "sizingV"]
  ];
  function normalizeAutoLayoutParams(params) {
    const num = (v) => typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : void 0;
    const spec = {};
    const rawMode = params.mode ?? params.layoutMode;
    if (typeof rawMode === "string") spec.layoutMode = LAYOUT_MODE_MAP[rawMode.toUpperCase()];
    const padList = Array.isArray(params.pad) ? params.pad : typeof params.pad === "string" ? params.pad.split(",") : null;
    if (padList) {
      const [t, r, b, l] = padList.map((p) => num(p) ?? 0);
      spec.paddingTop = t;
      spec.paddingRight = r ?? t;
      spec.paddingBottom = b ?? t;
      spec.paddingLeft = l ?? r ?? t;
    }
    if (params.padding && typeof params.padding === "object") {
      const p = params.padding;
      if (num(p.top) !== void 0) spec.paddingTop = num(p.top);
      if (num(p.right) !== void 0) spec.paddingRight = num(p.right);
      if (num(p.bottom) !== void 0) spec.paddingBottom = num(p.bottom);
      if (num(p.left) !== void 0) spec.paddingLeft = num(p.left);
    }
    for (const [field, ...aliases] of NUM_PARAM_ALIASES) {
      for (const alias of aliases) {
        const v = num(params[alias]);
        if (v !== void 0) {
          spec[field] = v;
          break;
        }
      }
    }
    for (const [field, alias] of STR_PARAM_ALIASES) {
      if (typeof params[alias] === "string") spec[field] = params[alias].toUpperCase();
    }
    if (params.wrap === true || params.wrap === "WRAP") spec.layoutWrap = "WRAP";
    return spec;
  }
  async function getSceneNode(id, label = "node") {
    if (typeof id !== "string" || !id) throw withCode(new Error(`missing ${label} id`), "E_INVALID_ARGS");
    const node = await figma.getNodeByIdAsync(id);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      throw withCode(new Error(`${label} not found: ${id}`), "E_INVALID_ARGS");
    }
    return node;
  }
  async function appendToParent(node, params) {
    const parentId = params.parentId ?? params.parent;
    if (typeof parentId === "string" && parentId) {
      const parent = await figma.getNodeByIdAsync(parentId);
      if (parent && "appendChild" in parent) parent.appendChild(node);
    }
    if (typeof params.x === "number") node.x = params.x;
    if (typeof params.y === "number") node.y = params.y;
  }
  function opStatus() {
    return {
      fileName: figma.root.name,
      page: figma.currentPage.name,
      user: figma.currentUser ? figma.currentUser.name : null,
      pluginVersion: PLUGIN_VERSION
    };
  }
  function opGetSelection(params) {
    const depth = typeof params.depth === "number" ? params.depth : 1;
    return { selection: figma.currentPage.selection.map((n) => serializeNode(n, depth)) };
  }
  async function opCreateFrame(params) {
    const frame = figma.createFrame();
    frame.name = typeof params.name === "string" && params.name ? params.name : "Frame";
    const w = Number(params.width ?? params.w) || 100;
    const h = Number(params.height ?? params.h) || 100;
    frame.resize(w, h);
    await appendToParent(frame, params);
    return { id: frame.id };
  }
  async function opCreateInstance(params) {
    const ref = params.component ?? params.key ?? params.id;
    if (typeof ref !== "string" || !ref) {
      throw withCode(new Error("CREATE_INSTANCE requires params.component (library key or local node id)"), "E_INVALID_ARGS");
    }
    let component = null;
    if (!ref.includes(":")) {
      try {
        component = await figma.importComponentByKeyAsync(ref);
      } catch {
      }
    }
    if (!component) {
      const local = await figma.getNodeByIdAsync(ref);
      if (local && local.type === "COMPONENT") component = local;
      else if (local && local.type === "COMPONENT_SET") component = local.defaultVariant;
    }
    if (!component) throw withCode(new Error(`component not found: ${ref}`), "E_INVALID_ARGS");
    const instance = component.createInstance();
    await appendToParent(instance, params);
    return { id: instance.id, mainComponent: { id: component.id, key: component.key, name: component.name } };
  }
  async function opSetVariant(params) {
    const node = await getSceneNode(params.nodeId ?? params.node);
    if (node.type !== "INSTANCE") {
      throw withCode(new Error(`SET_VARIANT target must be an INSTANCE, got ${node.type}`), "E_INVALID_ARGS");
    }
    const props = params.props;
    if (!props || typeof props !== "object") {
      throw withCode(new Error("SET_VARIANT requires params.props {property: value}"), "E_INVALID_ARGS");
    }
    node.setProperties(props);
    const variantProps = {};
    try {
      for (const [k, v] of Object.entries(node.componentProperties)) variantProps[k] = v.value;
    } catch {
    }
    return { id: node.id, variantProps };
  }
  async function opSetAutoLayout(params) {
    const node = await getSceneNode(params.nodeId ?? params.node);
    if (!("layoutMode" in node)) {
      throw withCode(new Error(`node ${node.id} (${node.type}) does not support auto-layout`), "E_INVALID_ARGS");
    }
    const applied = applyAutoLayout(node, normalizeAutoLayoutParams(params), false);
    return { id: node.id, applied };
  }
  async function opSetConstraints(params) {
    const node = await getSceneNode(params.nodeId ?? params.node);
    if (!("constraints" in node)) {
      throw withCode(new Error(`node ${node.id} (${node.type}) does not support constraints`), "E_INVALID_ARGS");
    }
    const horizontal = params.horizontal ?? params.h ?? "MIN";
    const vertical = params.vertical ?? params.v ?? "MIN";
    node.constraints = { horizontal, vertical };
    return { id: node.id };
  }
  async function opSetText(params) {
    const node = await getSceneNode(params.nodeId ?? params.node);
    if (node.type !== "TEXT") {
      throw withCode(new Error(`SET_TEXT target must be TEXT, got ${node.type}`), "E_INVALID_ARGS");
    }
    if (node.characters.length > 0) {
      for (const f of node.getRangeAllFontNames(0, node.characters.length)) await figma.loadFontAsync(f);
    } else if (node.fontName !== figma.mixed) {
      await figma.loadFontAsync(node.fontName);
    }
    const reqFamily = params.fontFamily ?? params.family;
    const reqWeight = params.fontWeight ?? params.weight;
    const reqSize = params.fontSize ?? params.size;
    if (typeof reqFamily === "string" || typeof reqWeight === "number") {
      const family = typeof reqFamily === "string" && reqFamily ? reqFamily : node.fontName !== figma.mixed ? node.fontName.family : "Inter";
      const weight = typeof reqWeight === "number" ? reqWeight : 400;
      node.fontName = await loadBestFont(family, weight);
    }
    if (typeof params.characters === "string") node.characters = params.characters;
    if (typeof reqSize === "number") node.fontSize = reqSize;
    return { id: node.id };
  }
  async function opExportPng(params) {
    const id = params.nodeId ?? params.node;
    const target = typeof id === "string" && id ? await getSceneNode(id) : figma.currentPage.selection[0] ?? null;
    if (!target) throw withCode(new Error("EXPORT_PNG: no node id given and selection is empty"), "E_INVALID_ARGS");
    const scale = typeof params.scale === "number" && params.scale > 0 ? params.scale : 2;
    const bytes = await target.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
    return {
      base64: figma.base64Encode(bytes),
      w: Math.round(target.width * scale),
      h: Math.round(target.height * scale)
    };
  }
  async function opExecJs(params) {
    const code = params.code ?? params.js;
    if (typeof code !== "string" || !code.trim()) {
      throw withCode(new Error("EXEC_JS requires params.code (string)"), "E_INVALID_ARGS");
    }
    const logs = [];
    const capture = (level) => (...args) => {
      logs.push(`[${level}] ${args.map(safeStringify).join(" ")}`);
    };
    const consoleProxy = { log: capture("log"), info: capture("info"), warn: capture("warn"), error: capture("error") };
    const t0 = Date.now();
    let fn;
    try {
      try {
        fn = (0, eval)(`(async (console) => (${code}
))`);
      } catch {
        fn = (0, eval)(`(async (console) => { ${code}
 })`);
      }
    } catch (err) {
      throw withCode(new Error(`syntax error: ${err instanceof Error ? err.message : String(err)}`), "E_EVAL");
    }
    try {
      const result = await fn(consoleProxy);
      return { result: jsonSafe(result), console: logs, ms: Date.now() - t0 };
    } catch (err) {
      throw withCode(new Error(`runtime error: ${err instanceof Error ? err.message : String(err)}`), "E_EVAL");
    }
  }

  // plugin/src/ui/panel-model.ts
  var PANEL_WIDTH = 300;
  var PANEL_HEIGHT = { compact: 170, expanded: 460 };

  // plugin/src/main/main.ts
  figma.showUI(__html__, { visible: true, width: PANEL_WIDTH, height: PANEL_HEIGHT.compact });
  function announceFileInfo() {
    figma.ui.postMessage({
      type: "FILE_INFO",
      data: { fileName: figma.root.name, page: figma.currentPage.name }
    });
  }
  announceFileInfo();
  figma.on("currentpagechange", announceFileInfo);
  function resolveComponentIdentity(node) {
    if ("removed" in node && node.removed) {
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        return { id: node.id, name: null, type: node.type };
      }
      return null;
    }
    let n = node;
    while (n) {
      if (n.type === "COMPONENT_SET") return { id: n.id, name: n.name, type: n.type };
      if (n.type === "COMPONENT") {
        if (n.parent && n.parent.type === "COMPONENT_SET") {
          return { id: n.parent.id, name: n.parent.name, type: n.parent.type };
        }
        return { id: n.id, name: n.name, type: n.type };
      }
      n = n.parent;
    }
    return null;
  }
  var idleMs = DEFAULT_IDLE_MS;
  var idleTimer = null;
  var changesSinceCommit = 0;
  function resetIdleTimer() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(fireIdle, idleMs);
  }
  function fireIdle() {
    idleTimer = null;
    if (changesSinceCommit <= 0) return;
    figma.ui.postMessage({ type: "IDLE_READY", data: { count: changesSinceCommit } });
    changesSinceCommit = 0;
  }
  function onDocumentChange(event) {
    const raw = [];
    for (const dc of event.documentChanges) {
      const op = mapChangeType(dc.type);
      if (op === null) continue;
      const identity = resolveComponentIdentity(dc.node);
      if (!identity) continue;
      raw.push({
        op,
        nodeId: identity.id,
        nodeName: identity.name,
        nodeType: identity.type,
        changedProps: dc.type === "PROPERTY_CHANGE" ? [...dc.properties] : [],
        origin: dc.origin
      });
    }
    const changes = coalesceChanges(raw);
    if (changes.length === 0) return;
    figma.ui.postMessage({
      type: "DOC_CHANGE",
      data: { changes, page: figma.currentPage.name, fileKey: figma.fileKey ?? null }
    });
    changesSinceCommit += changes.length;
    resetIdleTimer();
  }
  figma.loadAllPagesAsync().then(() => figma.on("documentchange", onDocumentChange)).catch((err) => figma.notify(`live-sync capture disabled: ${err instanceof Error ? err.message : String(err)}`));
  figma.ui.onmessage = async (msg) => {
    const chrome = msg;
    if (chrome && chrome.type === "PANEL_RESIZE") {
      const raw = typeof chrome.h === "number" && Number.isFinite(chrome.h) ? chrome.h : PANEL_HEIGHT.compact;
      figma.ui.resize(PANEL_WIDTH, Math.round(Math.min(PANEL_HEIGHT.expanded, Math.max(PANEL_HEIGHT.compact, raw))));
      return;
    }
    if (chrome && chrome.type === "SYNC_CONFIG") {
      const raw = chrome.data?.idleMs;
      if (typeof raw === "number" && Number.isFinite(raw)) idleMs = Math.max(MIN_IDLE_MS, Math.floor(raw));
      return;
    }
    if (chrome && chrome.type === "SYNC_DONE") {
      changesSinceCommit = 0;
      return;
    }
    const req = msg;
    if (!req || typeof req.requestId !== "string" || typeof req.cmd !== "string") return;
    try {
      const result = await dispatch(req.cmd, req.params ?? {});
      figma.ui.postMessage({ requestId: req.requestId, ok: true, result });
    } catch (err) {
      figma.ui.postMessage({ requestId: req.requestId, ok: false, error: shapeError(err) });
    }
  };
  function shapeError(err) {
    const code = err?.code ?? "E_PLUGIN_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    return { code, message };
  }
  async function dispatch(cmd, params) {
    switch (cmd) {
      case "STATUS":
        return opStatus();
      case "GET_SELECTION":
        return opGetSelection(params);
      case "SCAN_DESIGN_SYSTEM":
        return serializeDesignSystem();
      case "AUDIT_DS":
        return auditDs();
      case "CREATE_FRAME":
        return opCreateFrame(params);
      case "CREATE_INSTANCE":
        return opCreateInstance(params);
      case "SET_VARIANT":
        return opSetVariant(params);
      case "CREATE_VARIABLE":
        return opCreateVariable(params);
      case "BIND_VARIABLE":
        return opBindVariable(params);
      case "SET_AUTOLAYOUT":
        return opSetAutoLayout(params);
      case "SET_CONSTRAINTS":
        return opSetConstraints(params);
      case "SET_TEXT":
        return opSetText(params);
      case "EXPORT_PNG":
        return opExportPng(params);
      case "EXEC_JS":
        return opExecJs(params);
      case "IMPORT_PAYLOAD":
        return importPayload(params);
      case "BATCH":
        return runBatch(params);
      default:
        throw withCode(new Error(`unknown command: ${cmd}`), "E_INVALID_ARGS");
    }
  }
  async function importPayload(params) {
    const payload = params.payload ?? params;
    if (!payload || typeof payload !== "object" || !payload.rootNode) {
      throw withCode(new Error("IMPORT_PAYLOAD requires params.payload (FigmaExportPayload with rootNode)"), "E_INVALID_ARGS");
    }
    resetImportWarnings();
    resetKeyedVariableCache();
    const tokens = payload.tokens ?? { colors: [], typography: [], spacing: [], radii: [], shadows: [] };
    const colorStyles = await createColorStyles(tokens.colors ?? []);
    await createTextStyles(tokens.typography ?? []);
    await createEffectStyles(tokens.shadows ?? []);
    const tokenVars = await resolveTokenVars(tokens);
    const root = await createFigmaNode(payload.rootNode, colorStyles, tokenVars);
    if (!root) throw new Error("payload rootNode produced no Figma node");
    let replaceTarget = null;
    if (typeof params.replaceId === "string" && params.replaceId) {
      const t = await figma.getNodeByIdAsync(params.replaceId);
      if (t && t.type !== "DOCUMENT" && t.type !== "PAGE") replaceTarget = t;
    }
    let parent = figma.currentPage;
    if (typeof params.parentId === "string" && params.parentId) {
      const p = await figma.getNodeByIdAsync(params.parentId);
      if (p && "appendChild" in p) parent = p;
    }
    parent.appendChild(root);
    if (replaceTarget) {
      root.x = replaceTarget.x;
      root.y = replaceTarget.y;
      replaceTarget.remove();
    } else if (typeof params.x === "number" && typeof params.y === "number") {
      root.x = params.x;
      root.y = params.y;
    } else {
      root.x = Math.round(figma.viewport.center.x - root.width / 2);
      root.y = Math.round(figma.viewport.center.y - root.height / 2);
    }
    try {
      figma.currentPage.selection = [root];
      figma.viewport.scrollAndZoomIntoView([root]);
    } catch {
    }
    figma.notify(`Imported "${payload.name}" (${(tokens.colors ?? []).length} colors, ${(tokens.typography ?? []).length} text styles)`);
    return { id: root.id, name: root.name, warnings: getImportWarnings() };
  }
  async function runBatch(params) {
    const ops = Array.isArray(params) ? params : params.ops;
    if (!Array.isArray(ops)) {
      throw withCode(new Error("BATCH requires params.ops: {cmd, params}[]"), "E_INVALID_ARGS");
    }
    const stopOnError = params.stopOnError === true;
    const results = [];
    for (const op of ops) {
      try {
        results.push({ ok: true, cmd: op.cmd, result: await dispatch(op.cmd, op.params ?? {}) });
      } catch (err) {
        results.push({ ok: false, cmd: op.cmd, error: shapeError(err) });
        if (stopOnError) break;
      }
    }
    return { results };
  }
})();

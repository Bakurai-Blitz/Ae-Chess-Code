// Chess Tools — Clean Rebuild (compact premium UI, blue palette)
// Paste into After Effects ExtendScript and run
(function () {

    // ===============================
    // CONSTANTS
    // ===============================
    var FILES = ["a","b","c","d","e","f","g","h"];
    var MOVE_DURATION = 0.5;
    var SNAP_FLAT_EPS = 0.001; // tiny time to create flat key segment

    // ===============================
    // BOARD MATH (same as builder)
    // ===============================
    function squareToPos(square, comp) {
        var boardSize = Math.min(comp.width, comp.height);
        var sq = boardSize / 8;
        var left = (comp.width - boardSize) / 2;
        var top  = (comp.height - boardSize) / 2;

        var col = FILES.indexOf(String(square).charAt(0));
        var row = 8 - parseInt(String(square).charAt(1), 10);
        col = Math.max(0, Math.min(7, col));
        row = Math.max(0, Math.min(7, row));

        return [
            left + sq * (col + 0.5),
            top  + sq * (row + 0.5)
        ];
    }

    function posToNearestSquare(pos, comp) {
        var boardSize = Math.min(comp.width, comp.height);
        var sq = boardSize / 8;
        var left = (comp.width - boardSize) / 2;
        var top  = (comp.height - boardSize) / 2;

        var col = Math.round((pos[0] - left) / sq - 0.5);
        var row = Math.round((pos[1] - top)  / sq - 0.5);

        col = Math.max(0, Math.min(7, col));
        row = Math.max(0, Math.min(7, row));

        return FILES[col] + (8 - row);
    }

    // ===============================
    // SAFETY HELPERS
    // ===============================
    function getComp() {
        var c = app.project.activeItem;
        if (!(c && c instanceof CompItem)) {
            alert("Select an active composition.");
            return null;
        }
        return c;
    }

    function getOneLayer(comp) {
        if (comp.selectedLayers.length !== 1) {
            alert("Select exactly ONE piece layer.");
            return null;
        }
        return comp.selectedLayers[0];
    }

    // ===============================
    // ORIGINAL POSITION STORAGE (MARKERS, per-type)
    // Types: MANUAL, SNAP
    // Marker comment format: "ORIG|<TYPE>|x,y"
    // ===============================
    function _findMarkerIndexByType(layer, type) {
        if (!layer || !layer.marker) return 0;
        var mk = layer.marker;
        for (var k = 1; k <= mk.numKeys; k++) {
            var val = mk.keyValue(k);
            if (val && val.comment && val.comment.indexOf("ORIG|" + type + "|") === 0) return k;
        }
        return 0;
    }

    function storeOriginal(layer, type) {
        type = type || "MANUAL";
        if (!layer || !layer.marker) return;
        if (_findMarkerIndexByType(layer, type) !== 0) return; // already stored for this type

        // Save a snapshot of current transform.position (value at current time)
        var posVal = [0,0];
        try { posVal = layer.property("Transform").property("Position").value; } catch(e){}

        var m = new MarkerValue("ORIG|" + type + "|" + posVal[0] + "," + posVal[1]);
        // store at time 0 so consistent
        layer.marker.setValueAtTime(0, m);
    }

    function restoreOriginal(layer, type) {
        type = type || "MANUAL";
        if (!layer || !layer.marker) return false;
        var idx = _findMarkerIndexByType(layer, type);
        if (idx === 0) return false;
        var m = layer.marker.keyValue(idx);
        if (!m || !m.comment) return false;
        var parts = m.comment.split("|");
        if (parts.length < 3) return false;
        var coords = parts[2].split(",");
        if (coords.length < 2) return false;

        var posProp = layer.property("Transform").property("Position");

        // remove ALL position keyframes we created (best-effort)
        try {
            while (posProp.numKeys > 0) {
                posProp.removeKey(1);
            }
        } catch(e){}

        posProp.setValue([parseFloat(coords[0]), parseFloat(coords[1])]);

        // remove that marker
        try { layer.marker.removeKey(idx); } catch (e) {}
        return true;
    }

    // Restore both types
    function restoreAllOriginals(layer) {
        var a = restoreOriginal(layer, "MANUAL");
        var b = restoreOriginal(layer, "SNAP");
        return a || b;
    }

    function createGridHighlight(comp, square, colorArr) {
        var boardSize = Math.min(comp.width, comp.height);
        var sq = boardSize / 8;

        var t = comp.time;

        // create shape layer
        var hl = comp.layers.addShape();
        hl.name = "HL_" + square + "_" + Math.round(t * 1000);

        // rectangle
        var g = hl.content.addProperty("ADBE Vector Group");
        var rect = g.content.addProperty("ADBE Vector Shape - Rect");
        rect.property("Size").setValue([sq, sq]);
        rect.property("Position").setValue([0, 0]);

        var fill = g.content.addProperty("ADBE Vector Graphic - Fill");
        // Blue/ky palette highlight
      fill.property("Color").setValue(colorArr);  
        fill.property("Opacity").setValue(100);

    // === Lifetime + Fade System ===
var LIFE = 0.7;        // total seconds
var FADE = 0.05;     // fade duration

var op = hl.property("Transform").property("Opacity");

// Fade In
op.setValueAtTime(0, 0);
op.setValueAtTime(FADE, 100);

// Hold
op.setValueAtTime(LIFE - FADE, 100);

// Fade Out
op.setValueAtTime(LIFE, 0);

// Trim layer
hl.outPoint = hl.startTime + LIFE;
op.setValueAtTime(0.05, 100);
        // ---- Deep Glow 2 (find Radius & Exposure safely) ----
        try {
            var fx = hl.property("Effects").addProperty("Deep Glow 2");

            function setParams(propGroup) {
                for (var i = 1; i <= propGroup.numProperties; i++) {
                    var p = propGroup.property(i);

                    if (p.name === "Radius") {
                        p.setValue(500);
                    }

                    if (p.name === "Exposure") {
                        p.setValue(0.25);
                    }

                    if (p.numProperties > 0) {
                        setParams(p);
                    }
                }
            }

            setParams(fx);

        } catch (e) {
            // plugin optional — don't break flow
        }

        // transform
        hl.property("Transform").property("Position").setValue(
            squareToPos(square, comp)
        );
       

        // start at playhead
        hl.startTime = t;
        hl.inPoint = t;
        hl.outPoint = hl.startTime + LIFE;

        // place ABOVE GRID but BELOW pieces (best-effort)
        try {
            var gridLayer = comp.layer("GRID");
            if (gridLayer) {
                hl.moveBefore(gridLayer);
            }
        } catch (e) {}
    }

   function createBoundaryHighlight(comp, square, colorArr) {

    var boardSize = Math.min(comp.width, comp.height);
    var sq = boardSize / 8;

    var t = comp.time;
    var DURATION = 0.33; // snappy

    // CREATE SHAPE LAYER
    var hl = comp.layers.addShape();
    hl.name = "BOUNDARY_" + square + "_" + Math.round(t*1000);

    // rectangle group
    var g = hl.content.addProperty("ADBE Vector Group");

    var rect = g.content.addProperty("ADBE Vector Shape - Rect");
    rect.property("Size").setValue([sq, sq]);

    // STROKE (outline)
    var stroke = g.content.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("Color").setValue(colorArr);
    stroke.property("Stroke Width").setValue(10);

    // place on square
    hl.property("Transform").property("Position").setValue(
        squareToPos(square, comp)
    );

    // force layer start at playhead
    hl.startTime = t;
    hl.inPoint = t;
    hl.outPoint = t + DURATION;

    // stronger size expansion
var scale = hl.property("Transform").property("Scale");

scale.setValueAtTime(t, [100,100]);
scale.setValueAtTime(t + DURATION, [160,160]);

var opacity = hl.property("Transform").property("Opacity");

opacity.setValueAtTime(t, 100);
opacity.setValueAtTime(t + DURATION, 0);
    // place above grid
    try {
        var gridLayer = comp.layer("GRID");
        if (gridLayer) hl.moveBefore(gridLayer);
    } catch(e){}
}

function createCircleHighlight(comp, square, colorArr) {

    var boardSize = Math.min(comp.width, comp.height);
    var sq = boardSize / 8;

    var t = comp.time;
    var DURATION = 0.33;

    // create layer
    var hl = comp.layers.addShape();
    hl.name = "CIRCLE_" + square + "_" + Math.round(t * 1000);

    // shape group
    var g = hl.content.addProperty("ADBE Vector Group");

    // ellipse instead of rectangle
    var ellipse = g.content.addProperty("ADBE Vector Shape - Ellipse");
    ellipse.property("Size").setValue([sq, sq]);

    // stroke
    var stroke = g.content.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("Color").setValue(colorArr);
    stroke.property("Stroke Width").setValue(10);

    // place on square
    hl.property("Transform").property("Position").setValue(
        squareToPos(square, comp)
    );

    // timing
    hl.startTime = t;
    hl.inPoint = t;
    hl.outPoint = t + DURATION;

    // === TIMING ===
var DURATION = 0.3;
var FADE = 0.05;

// OPACITY CONTROL
var opacity = hl.property("Transform").property("Opacity");

opacity.setValueAtTime(t, 0);
opacity.setValueAtTime(t + FADE, 100);
opacity.setValueAtTime(t + 0.25, 100);

// STROKE SHRINK
var strokeWidth = stroke.property("Stroke Width");

strokeWidth.setValueAtTime(t, 10);
strokeWidth.setValueAtTime(t + 0.25, 10);
strokeWidth.setValueAtTime(t + 0.28, 0);

// SCALE PULSE (optional but keeps effect lively)
var scale = hl.property("Transform").property("Scale");
scale.setValueAtTime(t, [100,100]);
scale.setValueAtTime(t + DURATION, [160,160]);

    // layer order
    try {
        var gridLayer = comp.layer("GRID");
        if (gridLayer) hl.moveBefore(gridLayer);
    } catch(e){}
}
    // ===============================
    // UI (COMPACT, PREMIUM, BLUE PALETTE)
    // - compact horizontal layout
    // - left: tight 8x8 board of buttons
    // - right: slim vertical control column with premium buttons
    // - blue palette: ky-blue (primary), deep purple (accent), light-cyan (bg)
    // ===============================

    // palette (RGB values 0..1)
    var COLOR_PRIMARY = [0.09, 0.45, 0.94, 1]; // ky-blue (primary)
    var COLOR_ACCENT  = [0.36, 0.18, 0.64, 1]; // deep purple (accent)
    var COLOR_LIGHT   = [0.92, 0.97, 1.0, 1];  // very light cyan (background)

    // helper: attempt to style a button (works in ExtendScript UIs that support graphics)
    function styleButton(btn, bg, fg, radius) {
        try {
            var g = btn.graphics;
            if (g && g.newBrush) {
                btn.graphics.backgroundColor = g.newBrush(g.BrushType.SOLID_COLOR, bg);
                btn.graphics.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, fg, 1);
            }
            // small rounding hint if supported
            try { btn.graphics.roundRect = !!radius; } catch (e) {}
        } catch (e) {}
    }

    // main window
    var win = new Window("palette", "Chess Tools — Premium", undefined, {resizeable:false});
    win.orientation = "row";
    win.alignChildren = ["top","fill"];
    win.margins = 10;

    // left panel: compact board
    var boardPanel = win.add("panel", undefined, undefined, {borderStyle:"etched"});
    boardPanel.text = "";
    boardPanel.orientation = "column";
    boardPanel.alignChildren = ["center","center"];
    boardPanel.margins = [8,8,8,8];

    // smaller spacing between buttons and larger buttons
    var VBTN = 40; // button size (increased)
    var HSPACE = 2; // horizontal spacing (reduced)
    var VSPACE = 2; // vertical spacing (reduced)

    // create a compact grid wrapper with fixed size
    var gridPanel = boardPanel.add("group");
    gridPanel.orientation = "column";
    gridPanel.alignChildren = "left";
    gridPanel.spacing = VSPACE;

    // 8 rows
    var selectedSquares = [];
    var info = win.add("statictext", undefined, ""); // will be hidden; we use small status in sidebar

    // create rows (tight layout)
    var squareButtons = {}; // store references
    for (var r = 0; r < 8; r++) {
        var row = gridPanel.add("group");
        row.orientation = "row";
        row.spacing = HSPACE;
        row.margins = [0,0,0,0];
        for (var c = 0; c < 8; c++) {
            (function(col, rowNum) {
                var sq = FILES[col] + (8 - rowNum);
                var b = row.add("button", undefined, sq);
                b.size = [VBTN, VBTN];
                b.margins = [0,0,0,0];

                // color alternating squares subtly (premium tone)
                var isDark = ((rowNum + col) % 2 === 1);
                var base = isDark ? [0.06,0.2,0.45,1] : [0.88,0.94,1.0,1];
                // slightly tint with primary color for premium look
                var bg = [
                    (base[0] * 0.45 + COLOR_PRIMARY[0] * 0.55),
                    (base[1] * 0.45 + COLOR_PRIMARY[1] * 0.55),
                    (base[2] * 0.45 + COLOR_PRIMARY[2] * 0.55),
                    1
                ];
                var fg = [1,1,1,1]; // button label in white for contrast

                styleButton(b, bg, fg, 6);

       b.onClick = function () {

    var shiftHeld = ScriptUI.environment.keyboardState.shiftKey;

    if (!shiftHeld) {
        // Normal click → clear previous selection
        selectedSquares = [];
    }

    var index = selectedSquares.indexOf(sq);

    if (index === -1) {
        selectedSquares.push(sq);
    }

    smallStatus.text = selectedSquares.length > 0
        ? "Targets: " + selectedSquares.join(", ")
        : "Target: none";
};              })(c, r);
        }
    }

    // right sidebar: slim premium control column
    var sidebar = win.add("panel", undefined, undefined, {borderStyle:"none"});
    sidebar.orientation = "column";
    sidebar.alignChildren = ["fill","top"];
    sidebar.margins = [8,8,8,8];
    sidebar.minimumSize = [220, 280];
    sidebar.backg = COLOR_LIGHT;

    // small header (premium)
    var header = sidebar.add("group");
    header.orientation = "column";
    var title = header.add("statictext", undefined, "Chess Tools");
    title.graphics.font = ScriptUI.newFont("Tahoma", "Bold", 14);
    var subtitle = header.add("statictext", undefined, "Premium — Blue Palette");
    subtitle.graphics.font = ScriptUI.newFont("Tahoma", "Regular", 10);
    subtitle.graphics.foregroundColor = subtitle.graphics.newPen(subtitle.graphics.PenType.SOLID_COLOR, [0.2,0.2,0.2,1], 1);

    // status
    var smallStatus = sidebar.add("statictext", undefined, "Target: none");
    smallStatus.graphics.font = ScriptUI.newFont("Tahoma", "Regular", 11);

    // controls group (compact)
    var ctrlGroup = sidebar.add("group");
    ctrlGroup.orientation = "column";
    ctrlGroup.alignChildren = ["fill","center"];
    ctrlGroup.spacing = 8;

    var btnSelectKeys = ctrlGroup.add("button", undefined, "Select  After Playhead");
    var btnFlip = ctrlGroup.add("button", undefined, "Flip Perspective (180°)");

    // action row (stacked)
    var btnMove = ctrlGroup.add("button", undefined, "MOVE (Animate)");
    var btnSnap = ctrlGroup.add("button", undefined, "SNAP (Instant)");
    var btnHighlight = ctrlGroup.add("button", undefined, "Highlight");
    var btnBoundary = ctrlGroup.add("button", undefined, "Boundary");
    var btnCircle = ctrlGroup.add("button", undefined, "Circle");
var colorGroup = ctrlGroup.add("group");
colorGroup.orientation = "row";

var colorLabel = colorGroup.add("statictext", undefined, "Color:");

var hexInput = colorGroup.add("edittext", undefined, "#1773F0");
hexInput.characters = 8;

var btnPickColor = colorGroup.add("button", undefined, "Pick");
    // reset group compact
    var resetGroup = sidebar.add("group");
    resetGroup.orientation = "row";
    resetGroup.alignChildren = ["fill","top"];
    resetGroup.spacing = 6;
    var btnResetManual = resetGroup.add("button", undefined, "Reset Manual");
    var btnResetSnap   = resetGroup.add("button", undefined, "Reset Snap");
    var btnResetAll    = resetGroup.add("button", undefined, "Reset All");

    // style sidebar buttons with primary & accent colors
    var btns = [btnSelectKeys, btnFlip, btnMove, btnSnap, btnHighlight, btnBoundary, btnCircle, btnResetManual, btnResetSnap, btnResetAll];
    for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        // alternate primary / accent for premium contrast
        var useAccent = (i % 2 === 1);
        var bg = useAccent ? COLOR_ACCENT : COLOR_PRIMARY;
        var fg = [1,1,1,1];
        styleButton(b, bg, fg, 6);
        b.graphics.font = ScriptUI.newFont("Tahoma", "Bold", 11);
        b.margins = [6,6,6,6];
    }

    // small compact footer
    var footer = sidebar.add("group");
    footer.orientation = "row";
    footer.alignment = "right";
    var about = footer.add("statictext", undefined, "v1.0");
    about.graphics.font = ScriptUI.newFont("Tahoma", "Regular", 9);


  

    // ===============================
    // BUTTON LOGIC (unchanged behavior)
    // ===============================
    btnSelectKeys.onClick = function () {
        app.beginUndoGroup("Select Keys After Playhead");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        var t = comp.time;
        for (var i = 1; i <= comp.numLayers; i++) {
            scanProps(comp.layer(i), t);
        }
        app.endUndoGroup();
    };

    function hexToRGB01(hex) {

    hex = hex.replace("#", "");

    if (hex.length === 3) {
        hex = hex[0]+hex[0] + hex[1]+hex[1] + hex[2]+hex[2];
    }

    if (hex.length !== 6) return null;

    var r = parseInt(hex.substring(0,2), 16) / 255;
    var g = parseInt(hex.substring(2,4), 16) / 255;
    var b = parseInt(hex.substring(4,6), 16) / 255;

    return [r, g, b];
}

btnHighlight.onClick = function () {

    app.beginUndoGroup("Add Multi Highlight");

    var comp = getComp();
    if (!comp) { app.endUndoGroup(); return; }

    if (selectedSquares.length === 0) {
        alert("Select at least one square.");
        app.endUndoGroup();
        return;
    }

 var colorArr = hexToRGB01(hexInput.text);

if (!colorArr) {
    alert("Invalid HEX color.");
    app.endUndoGroup();
    return;
}

    for (var i = 0; i < selectedSquares.length; i++) {
        createGridHighlight(comp, selectedSquares[i], colorArr);
    }
    
selectedSquares = [];
smallStatus.text = "Target: none";
    app.endUndoGroup();
};
    function scanProps(prop, time) {
        if (!prop) return;
        if (prop.numProperties === undefined) return;
        for (var i = 1; i <= prop.numProperties; i++) {
            var p = prop.property(i);
            if (!p) continue;
            if (p.numKeys && p.numKeys > 0) {
                for (var k = 1; k <= p.numKeys; k++) {
                    try {
                        if (p.keyTime(k) >= time) { p.setSelectedAtKey(k, true); }
                    } catch (e) {}
                }
            }
            if (p.numProperties) scanProps(p, time);
        }
    }

    btnBoundary.onClick = function () {

    app.beginUndoGroup("Boundary Highlight");

    var comp = getComp();
    if (!comp) { app.endUndoGroup(); return; }

    if (selectedSquares.length === 0) {
        alert("Select at least one square.");
        app.endUndoGroup();
        return;
    }

    var colorArr = hexToRGB01(hexInput.text);

    if (!colorArr) {
        alert("Invalid HEX color.");
        app.endUndoGroup();
        return;
    }

    for (var i = 0; i < selectedSquares.length; i++) {
        createBoundaryHighlight(comp, selectedSquares[i], colorArr);
    }

    selectedSquares = [];
    smallStatus.text = "Target: none";

    app.endUndoGroup();
};


btnCircle.onClick = function () {

    app.beginUndoGroup("Circle Highlight");

    var comp = getComp();
    if (!comp) { app.endUndoGroup(); return; }

    if (selectedSquares.length === 0) {
        alert("Select at least one square.");
        app.endUndoGroup();
        return;
    }

    var colorArr = hexToRGB01(hexInput.text);

    if (!colorArr) {
        alert("Invalid HEX color.");
        app.endUndoGroup();
        return;
    }

    for (var i = 0; i < selectedSquares.length; i++) {
        createCircleHighlight(comp, selectedSquares[i], colorArr);
    }

    selectedSquares = [];
    smallStatus.text = "Target: none";

    app.endUndoGroup();
};



    btnFlip.onClick = function () {
        app.beginUndoGroup("Flip Perspective");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        var cx = comp.width / 2;
        var cy = comp.height / 2;
        for (var i = 1; i <= comp.numLayers; i++) {
            var l = comp.layer(i);
            var p = l.property("Transform").property("Position");
            if (!p) continue;
            if (p.numKeys > 0) {
                for (var k = 1; k <= p.numKeys; k++) {
                    var v = p.keyValue(k);
                    p.setValueAtKey(k, [cx*2 - v[0], cy*2 - v[1]]);
                }
            } else {
                var v0 = p.value;
                p.setValue([cx*2 - v0[0], cy*2 - v0[1]]);
            }
        }
        app.endUndoGroup();
    };

    btnMove.onClick = function () {
    app.beginUndoGroup("Manual Move");

    var comp = getComp(); 
    if (!comp) { app.endUndoGroup(); return; }

    if (selectedSquares.length !== 1) {
        alert("Select exactly ONE square for MOVE.");
        app.endUndoGroup();
        return;
    }

    var layer = getOneLayer(comp); 
    if (!layer) { app.endUndoGroup(); return; }

    var targetSquare = selectedSquares[0];

    var pos = layer.property("Transform").property("Position");
    var t = comp.time;

    pos.setValueAtTime(t, pos.value);
    pos.setValueAtTime(t + MOVE_DURATION, squareToPos(targetSquare, comp));

    selectedSquares = [];
    smallStatus.text = "Target: none";

    app.endUndoGroup();
};

 btnSnap.onClick = function () {
    app.beginUndoGroup("Snap Piece Clean");

    var comp = getComp();
    if (!comp) { app.endUndoGroup(); return; }

    var layer = getOneLayer(comp);
    if (!layer) { app.endUndoGroup(); return; }

    var posProp = layer.property("Transform").property("Position");
    var t = comp.time;

    var sq = posToNearestSquare(posProp.value, comp);
    var snapPos = squareToPos(sq, comp);

    // ONLY set one keyframe at playhead
    posProp.setValueAtTime(t, snapPos);

    app.endUndoGroup();
};

btnPickColor.onClick = function () {

    var initial = hexToRGB01(hexInput.text);
    if (!initial) initial = [0.1,0.4,0.9];

    var picked = $.colorPicker(initial);

    if (picked !== -1) {
        var r = ((picked >> 16) & 255).toString(16);
        var g = ((picked >> 8) & 255).toString(16);
        var b = (picked & 255).toString(16);

        if (r.length < 2) r = "0" + r;
        if (g.length < 2) g = "0" + g;
        if (b.length < 2) b = "0" + b;

        hexInput.text = "#" + r + g + b;
    }
};
    // Reset buttons
    btnResetManual.onClick = function () {
        app.beginUndoGroup("Reset Selected Manual");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        if (comp.selectedLayers.length === 0) { alert("Select one or more layers to reset MANUAL."); app.endUndoGroup(); return; }
        var count = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            if (restoreOriginal(comp.selectedLayers[i], "MANUAL")) count++;
        }
        alert("Reset MANUAL on " + count + " layer(s).");
        app.endUndoGroup();
    };

    btnResetSnap.onClick = function () {
        app.beginUndoGroup("Reset Selected Snap");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        if (comp.selectedLayers.length === 0) { alert("Select one or more layers to reset SNAP."); app.endUndoGroup(); return; }
        var count = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            if (restoreOriginal(comp.selectedLayers[i], "SNAP")) count++;
        }
        alert("Reset SNAP on " + count + " layer(s).");
        app.endUndoGroup();
    };

    btnResetAll.onClick = function () {
        app.beginUndoGroup("Reset ALL (selected)");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        if (comp.selectedLayers.length === 0) { alert("Select one or more layers to reset."); app.endUndoGroup(); return; }
        var cnt = 0;
        for (var i = 0; i < comp.selectedLayers.length; i++) {
            var l = comp.selectedLayers[i];
            if (restoreOriginal(l,"MANUAL") || restoreOriginal(l,"SNAP")) cnt++;
        }
        alert("Reset originals for " + cnt + " layer(s).");
        app.endUndoGroup();
    };

    // finalize
    win.center();
    win.show();

})();

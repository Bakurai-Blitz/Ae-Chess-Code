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

    function createGridHighlight(comp, square) {
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
        fill.property("Color").setValue([0.09, 0.45, 0.94]); // ky-blue
        fill.property("Opacity").setValue(100);

        // ===============================
        // SCALE-IN ANIMATION (FINAL)
        // ===============================
        var xf = g.property("ADBE Vector Transform Group");
        var scaleProp = xf.property("ADBE Vector Scale");

        // DURATION: user requested 0.5s scale-up (premium feel)
        var D = 0.2;

        // ensure center scaling
        xf.property("ADBE Vector Anchor").setValue([0, 0]);

        // IMPORTANT: layer time, not comp time
        scaleProp.setValueAtTime(0, [0, 0]);
        scaleProp.setValueAtTime(D, [100, 100]);

        // simple ease
        for (var k = 1; k <= scaleProp.numKeys; k++) {
            scaleProp.setInterpolationTypeAtKey(
                k,
                KeyframeInterpolationType.BEZIER,
                KeyframeInterpolationType.BEZIER
            );
        }

        // ---- Deep Glow 2 (find Radius & Exposure safely) ----
        try {
            var fx = hl.property("Effects").addProperty("Deep Glow 2");

            function setParams(propGroup) {
                for (var i = 1; i <= propGroup.numProperties; i++) {
                    var p = propGroup.property(i);

                    if (p.name === "Radius") {
                        p.setValue(100);
                    }

                    if (p.name === "Exposure") {
                        p.setValue(0.2);
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
        hl.property("Transform").property("Opacity").setValue(85);

        // start at playhead
        hl.startTime = t;
        hl.inPoint = t;

        // place ABOVE GRID but BELOW pieces (best-effort)
        try {
            var gridLayer = comp.layer("GRID");
            if (gridLayer) {
                hl.moveBefore(gridLayer);
            }
        } catch (e) {}
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
    var selectedSquare = null;
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
                    selectedSquare = sq;
                    smallStatus.text = "Target: " + sq;
                };
                squareButtons[sq] = b;
            })(c, r);
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

    var btnSelectKeys = ctrlGroup.add("button", undefined, "Select Keyframes After Playhead");
    var btnFlip = ctrlGroup.add("button", undefined, "Flip Perspective (180°)");

    // action row (stacked)
    var btnMove = ctrlGroup.add("button", undefined, "MOVE (Animate)");
    var btnSnap = ctrlGroup.add("button", undefined, "SNAP (Instant)");
    var btnHighlight = ctrlGroup.add("button", undefined, "Highlight");

    // reset group compact
    var resetGroup = sidebar.add("group");
    resetGroup.orientation = "row";
    resetGroup.alignChildren = ["fill","top"];
    resetGroup.spacing = 6;
    var btnResetManual = resetGroup.add("button", undefined, "Reset Manual");
    var btnResetSnap   = resetGroup.add("button", undefined, "Reset Snap");
    var btnResetAll    = resetGroup.add("button", undefined, "Reset All");

    // style sidebar buttons with primary & accent colors
    var btns = [btnSelectKeys, btnFlip, btnMove, btnSnap, btnHighlight, btnResetManual, btnResetSnap, btnResetAll];
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

    btnHighlight.onClick = function () {
        app.beginUndoGroup("Add Highlight");

        var comp = getComp();
        if (!comp) { app.endUndoGroup(); return; }

        if (!selectedSquare) {
            alert("Pick a square first.");
            app.endUndoGroup();
            return;
        }

        createGridHighlight(comp, selectedSquare);

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
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        if (!selectedSquare) { alert("Pick a square."); app.endUndoGroup(); return; }

        var layer = getOneLayer(comp); if (!layer) { app.endUndoGroup(); return; }
        storeOriginal(layer, "MANUAL");

        var pos = layer.property("Transform").property("Position");
        var t = comp.time;

        // create key at current time and a target at t+MOVE_DURATION
        try {
            pos.setValueAtTime(t, pos.value);
            pos.setValueAtTime(t + MOVE_DURATION, squareToPos(selectedSquare, comp));
        } catch(e) {}

        app.endUndoGroup();
    };

    btnSnap.onClick = function () {
        app.beginUndoGroup("Snap Piece");
        var comp = getComp(); if (!comp) { app.endUndoGroup(); return; }
        var layer = getOneLayer(comp); if (!layer) { app.endUndoGroup(); return; }

        storeOriginal(layer, "SNAP");

        var posProp = layer.property("Transform").property("Position");
        var t = comp.time;
        var sq = posToNearestSquare(posProp.value, comp);
        var snapPos = squareToPos(sq, comp);

        try {
            // remove any keys exactly at current time to avoid collisions
            if (posProp.numKeys > 0) {
                for (var k = posProp.numKeys; k >= 1; k--) {
                    var kt = posProp.keyTime(k);
                    if (Math.abs(kt - t) < 1e-6) {
                        try { posProp.removeKey(k); } catch(e){}
                    }
                }
            }
            // create a flat segment at time t (instant snap) - two identical keys
            posProp.setValueAtTime(t, snapPos);
            posProp.setValueAtTime(t + SNAP_FLAT_EPS, snapPos);
        } catch(e) {
            // fallback no-keys
            try { posProp.setValue(snapPos); } catch(e) {}
        }

        app.endUndoGroup();
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

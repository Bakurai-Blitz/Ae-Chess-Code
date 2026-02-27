app.beginUndoGroup("Chess Animation By Square");

// === SETTINGS ===
var compName = "Chess_Comp";
var compWidth = 1080;
var compHeight = 1920;
var compDuration = 60; // seconds
var compFPS = 60;

var assetsFolder = "C:/Users/ilove/Downloads/Ae Chess Tool ( TEST GIT HUB )/Ae Chess Tool/assets/";
var timelineJsonPath = "C:/Users/ilove/Downloads/Ae Chess Tool ( TEST GIT HUB )/Ae Chess Tool/timeline.json";

// === CREATE OR GET COMP ===
var proj = app.project;
if (!proj) app.newProject();

var comp = null;
for (var i = 1; i <= proj.numItems; i++) {
    if (proj.item(i) instanceof CompItem && proj.item(i).name === compName) {
        comp = proj.item(i);
        break;
    }
}
if (!comp) {
    comp = proj.items.addComp(compName, compWidth, compHeight, 1, compDuration, compFPS);
}
// === IMPORT BOARD (centered) + DRAW GRID (centered around origin) ===

// helper import
function importFile(path) {
    var f = new File(path);
    if (!f.exists) {
        alert("Missing file: " + path);
        throw new Error("File not found");
    }
    try {
        var opts = new ImportOptions(f);
        return proj.importFile(opts);
    } catch (e) {
        alert("FAILED TO IMPORT:\n" + path);
        throw e;
    }
}


// center coordinates
var compCenterX = comp.width / 2;
var compCenterY = comp.height / 2;

// compute board size as the smaller comp side so board stays square and centered
var boardSize = Math.min(comp.width, comp.height);
var squareSize = boardSize / 8;

// --- import board artwork and fit it into the square boardSize (keeps aspect) ---
var boardFootage = importFile(assetsFolder + "board.png");
var boardLayer = comp.layers.add(boardFootage);
boardLayer.name = "Board";
boardLayer.locked = true;
boardLayer.property("Position").setValue([compCenterX, compCenterY]);

// scale uniformly to fit inside boardSize (use both dims)
var scaleX = (boardSize / boardFootage.width) * 100;
var scaleY = (boardSize / boardFootage.height) * 100;
var boardScale = Math.min(scaleX, scaleY);
boardLayer.property("Scale").setValue([boardScale, boardScale]);

// === DRAW GRID ===
var squareSize = boardSize / 8;  // boardSize must be compWidth or compHeight whichever fits

var gridLayer = comp.layers.addShape();
gridLayer.name = "GRID";

// Add one big group to hold all squares
var gridGroup = gridLayer.content.addProperty("ADBE Vector Group");
gridGroup.name = "Grid_Group";

// Position squares starting at (0,0) so bounding box matches board size exactly
for (var r = 0; r < 8; r++) {
    for (var c = 0; c < 8; c++) {
        var group = gridGroup.content.addProperty("ADBE Vector Group");
        group.name = "Square_" + r + "_" + c;

        var rect = group.content.addProperty("ADBE Vector Shape - Rect");
        rect.property("Size").setValue([squareSize, squareSize]);

        var fill = group.content.addProperty("ADBE Vector Graphic - Fill");
        var dark = (r + c) % 2 === 1;

       fill.property("Color").setValue(dark ? [0.48, 0.46, 0.47] : [1, 1, 1]);

        // Position squares relative to top-left of gridGroup (starts at 0,0)
        var localX = squareSize * (c + 0.5);
        var localY = squareSize * (r + 0.5);

        group.property("Transform").property("Position").setValue([localX, localY]);
    }
}

// Set gridGroup anchor to center of bounding box (boardSize/2, boardSize/2)
gridGroup.property("Transform").property("Anchor Point").setValue([boardSize/2, boardSize/2]);

// Move gridGroup position to center gridLayer at (0,0)
gridGroup.property("Transform").property("Position").setValue([0, 0]);

// Set gridLayer anchor point to (0,0)
gridLayer.property("Transform").property("Anchor Point").setValue([0, 0]);

// Move the whole gridLayer to comp center
gridLayer.property("Transform").property("Position").setValue([compWidth/2, compHeight/2]);


// final safety: lock grid layer (optional) and move it to top so it's easy to find
try { gridLayer.locked = false; } catch(e) {}
gridLayer.moveToBeginning();


// === PIECES FROM FEN ===
var defaultFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
var fen = defaultFEN;

function readJSON(path) {
    var file = new File(path);
    if (!file.exists) {
        alert("Timeline JSON not found: " + path);
        throw new Error("No timeline");
    }
    file.open("r");
    var text = file.read();
    file.close();
    try {
        return JSON.parse(text);
    } catch (e) {
        alert("Invalid JSON in timeline.");
        throw new Error("Bad JSON");
    }
}

// Load timeline JSON
var timelineData = readJSON(timelineJsonPath);

if (timelineData.startFEN) {
    fen = timelineData.startFEN.split(" ")[0];
}

// Validate FEN (basic)
function validFEN(fenStr) {
    var ranks = fenStr.split("/");
    if (ranks.length !== 8) return false;
    for (var i = 0; i < 8; i++) {
        var count = 0;
        for (var j = 0; j < ranks[i].length; j++) {
            var ch = ranks[i][j];
            if (ch >= "1" && ch <= "8") count += parseInt(ch,10);
            else count++;
        }
        if (count !== 8) return false;
    }
    return true;
}

if (!validFEN(fen)) {
    alert("Invalid FEN. Using default start.");
    fen = defaultFEN;
}

var pieceMap = {
    "P": "w_pawn.png",
    "N": "w_knight.png",
    "B": "w_bishop.png",
    "R": "w_rook.png",
    "Q": "w_queen.png",
    "K": "w_king.png",
    "p": "b_pawn.png",
    "n": "b_knight.png",
    "b": "b_bishop.png",
    "r": "b_rook.png",
    "q": "b_queen.png",
    "k": "b_king.png"
};

// identity code map
var pieceCodeMap = {
    "K": "wk","Q": "wq","R": "wr","B": "wb","N": "wn","P": "wp",
    "k": "bk","q": "bq","r": "br","b": "bb","n": "bn","p": "bp"
};

// counters for duplicates (pawns, promoted pieces, multiple rooks/bishops/knights/queens)
var pieceCounters = {
    wk: 0, wq: 0, wr: 0, wb: 0, wn: 0, wp: 0,
    bk: 0, bq: 0, br: 0, bb: 0, bn: 0, bp: 0
};


var promoPieceMap = {
    "q": { white: "w_queen.png", black: "b_queen.png" },
    "r": { white: "w_rook.png",  black: "b_rook.png"  },
    "b": { white: "w_bishop.png",black: "b_bishop.png"},
    "n": { white: "w_knight.png",black: "b_knight.png"}
};

var footageCache = {};
function getFootage(name) {
    if (footageCache[name]) return footageCache[name];
    var file = new File(assetsFolder + name);
    if (!file.exists) {
        alert("Missing piece file: " + name);
        throw new Error("Missing piece");
    }
    var imp = new ImportOptions(file);
    var f = proj.importFile(imp);
    footageCache[name] = f;
    return f;
}

// Remove old piece layers
for (var i = comp.numLayers; i >= 1; i--) {
    var l = comp.layer(i);
    if (l.name.indexOf("Piece_") === 0) {
        l.remove();
    }
}

// UTILITIES
var files = ['a','b','c','d','e','f','g','h'];
function squareToCoords(square) {
    var file = square.charAt(0);
    var rank = square.charAt(1);
    var col = files.indexOf(file);
    var row = 8 - parseInt(rank, 10);
    return [col, row];
}
function coordsToPos(col,row) {
    var x = (compWidth - squareSize*8)/2 + squareSize*(col + 0.5);
    var y = (compHeight - squareSize*8)/2 + squareSize*(row + 0.5);
    return [x, y];
}

// === CREATE PIECE LAYERS FROM FEN (store metadata: layer, piece char, color) ===
var fenRanks = fen.split("/");
var pieceLayersBySquare = {}; // key: square string, value: { layer, piece, color }

for (var r = 0; r < 8; r++) {
    var rankStr = fenRanks[r];
    var fileIndex = 0;
    for (var c = 0; c < rankStr.length; c++) {
        var ch = rankStr.charAt(c);
        if (ch >= '1' && ch <= '8') {
            fileIndex += parseInt(ch, 10);
        } else {
            var imgName = pieceMap[ch];
            if (!imgName) { fileIndex++; continue; }

            var footage = getFootage(imgName);
            var layer = comp.layers.add(footage);

            // square like "e2"
            var squareName = files[fileIndex] + (8 - r);
            // === IDENTITY NAMING (STEP 2) ===
var baseCode = pieceCodeMap[ch];
var identityName;

if (baseCode === "wk" || baseCode === "bk") {
    pieceCounters[baseCode]++;
    identityName = baseCode;   // wk / bk
} else {
    pieceCounters[baseCode]++;
    identityName = baseCode + pieceCounters[baseCode]; // wp1, wr1, etc
}

layer.name = identityName;


            var pos = coordsToPos(fileIndex, r);
            layer.property("Position").setValue(pos);

            var scale = (squareSize / footage.width) * 100;
            layer.property("Scale").setValue([scale, scale]);

            // store metadata: piece char (as in FEN), color derived from char case
            var color = (ch === ch.toUpperCase()) ? "white" : "black";
            pieceLayersBySquare[squareName] = {
    layer: layer,
    piece: ch,
    color: color,
    id: identityName
};


            fileIndex++;
        }
    }
}


// === ANIMATE MOVES WITH AUTO-DETECTED CASTLING (king 2-file jump) & CAPTURE FADE ===
var startTime = 2;
var moveDuration = 0.3;
var fadeDuration = 0.02;
var timeCursor = startTime;
var gapBetweenMoves = 1; // seconds (tweak this)

// helper: find rook candidate object and its square for castling
function findRookObjectForCastling(isWhite, preferFile) {
    var expectedSq = preferFile + (isWhite ? "1" : "8");
    var obj = pieceLayersBySquare[expectedSq];
    if (obj && obj.piece && obj.piece.toLowerCase() === "r") return { sq: expectedSq, obj: obj };

    // fallback: scan same rank for a rook of the same color
    var rankChar = (isWhite ? "1" : "8");
    for (var sq in pieceLayersBySquare) {
        if (!pieceLayersBySquare.hasOwnProperty(sq)) continue;
        if (sq.charAt(1) !== rankChar) continue;
        var cand = pieceLayersBySquare[sq];
        if (!cand || !cand.piece) continue;
        if (cand.piece.toLowerCase() === "r" && cand.color === (isWhite ? "white" : "black")) {
            return { sq: sq, obj: cand };
        }
    }
    // final fallback: any rook of that color
    for (var s2 in pieceLayersBySquare) {
        if (!pieceLayersBySquare.hasOwnProperty(s2)) continue;
        var cand2 = pieceLayersBySquare[s2];
        if (!cand2 || !cand2.piece) continue;
        if (cand2.piece.toLowerCase() === "r" && cand2.color === (isWhite ? "white" : "black")) {
            return { sq: s2, obj: cand2 };
        }
    }
    return null;
}

for (var i = 0; i < timelineData.moves.length; i++) {
    var move = timelineData.moves[i];
    var fromSq = move.from_square;
    var toSq = move.to_square;

    if (!fromSq || !toSq) {
        alert("Move missing from_square or to_square at index " + i);
       timeCursor += moveDuration + gapBetweenMoves;
        continue;
    }

    var pieceObj = pieceLayersBySquare[fromSq];
    if (!pieceObj) {
        alert("No piece layer at square " + fromSq + " for move index " + i + " (move " + (i+1) + ")");
        timeCursor += moveDuration + gapBetweenMoves;

        continue;
    }
    var pieceLayer = pieceObj.layer;

    // compute positions
    var fromFileIndex = files.indexOf(fromSq.charAt(0));
    var toFileIndex   = files.indexOf(toSq.charAt(0));
    var fromPos = coordsToPos(fromFileIndex, 8 - parseInt(fromSq.charAt(1)));
    var toPos   = coordsToPos(toFileIndex,   8 - parseInt(toSq.charAt(1)));

    // baseline & animate the moving piece
    pieceLayer.property("Position").setValueAtTime(timeCursor, fromPos);
    pieceLayer.property("Position").setValueAtTime(timeCursor + moveDuration, toPos);

    // --- handle capture safely (fade AFTER move end) ---
    if (move.capture) {
        var capturedSq = move.captured_piece_square ? move.captured_piece_square : toSq;
        var capturedObj = pieceLayersBySquare[capturedSq];

        if (capturedObj && capturedObj.layer !== pieceLayer) {
            var capLayer = capturedObj.layer;
            var opacity = capLayer.property("Opacity");
            opacity.setValueAtTime(timeCursor, 100);
            var fadeStart = timeCursor + moveDuration;
            opacity.setValueAtTime(fadeStart + fadeDuration, 0);
            delete pieceLayersBySquare[capturedSq];
        }
    }
     
    // --- PROMOTION ---
if (move.promotion) {
    var promoType = move.promotion; // q r b n
    var promoColor = move.promotion_color || pieceObj.color;
    var promoSquare = move.promotion_square || toSq;

    // Fade out pawn
    var pawnOpacity = pieceLayer.property("Opacity");
    pawnOpacity.setValueAtTime(timeCursor + moveDuration, 100);
    pawnOpacity.setValueAtTime(timeCursor + moveDuration + fadeDuration, 0);

    // Create promoted piece layer
    var promoImg = promoPieceMap[promoType][promoColor];
    var promoFootage = getFootage(promoImg);
    var promoLayer = comp.layers.add(promoFootage);

    var promoCol = files.indexOf(promoSquare.charAt(0));
    var promoRow = 8 - parseInt(promoSquare.charAt(1), 10);
    var promoPos = coordsToPos(promoCol, promoRow);

    var promoBase = (promoColor === "white") ? "w" : "b";
var promoBaseCode = promoBase + promoType; // wq, wr, etc

pieceCounters[promoBaseCode]++;
var promoIdentity = promoBaseCode + pieceCounters[promoBaseCode];

promoLayer.name = promoIdentity;

    promoLayer.property("Position").setValue(promoPos);

    var promoScale = (squareSize / promoFootage.width) * 100;
    promoLayer.property("Scale").setValue([promoScale, promoScale]);

    // Appear after pawn fades
    promoLayer.property("Opacity").setValueAtTime(timeCursor + moveDuration, 0);
    promoLayer.property("Opacity").setValueAtTime(timeCursor + moveDuration + fadeDuration, 100);

    // Update state map
    delete pieceLayersBySquare[fromSq];
    pieceLayersBySquare[promoSquare] = {
    layer: promoLayer,
    piece: promoColor === "white" ? promoType.toUpperCase() : promoType,
    color: promoColor,
    id: promoIdentity
};


   timeCursor += moveDuration + gapBetweenMoves;
    continue;
}

     

    // --- AUTO-DETECT CASTLING: king moves exactly 2 files horizontally ---
    var isCastle = false;
    if (pieceObj.piece && pieceObj.piece.toLowerCase() === "k") {
        var fileDelta = toFileIndex - fromFileIndex;
        if (Math.abs(fileDelta) === 2) isCastle = true;
    }

    if (isCastle) {
        // determine sides
        var fromRank = parseInt(fromSq.charAt(1), 10);
        var isWhite = (fromRank === 1);
        var kingside = (toFileIndex > fromFileIndex); // to right => king-side

        // rook target for standard castling
        var rookTargetFileIndex = kingside ? toFileIndex - 1 : toFileIndex + 1;
        var rookTargetSquare = files[rookTargetFileIndex] + (isWhite ? "1" : "8");

        // prefer rook file: 'h' for kingside, 'a' for queenside
        var preferFile = kingside ? "h" : "a";

        // find actual rook (may have moved earlier)
        var rookFound = findRookObjectForCastling(isWhite, preferFile);
        if (!rookFound) {
            alert("Castling: rook not found for move index " + i + " (king " + fromSq + " -> " + toSq + "). King will move, rook skipped.");
        } else {
            var rookSq = rookFound.sq;
            var rookObj = rookFound.obj;
            var rookLayer = rookObj.layer;

            // compute rook positions (use actual rook square for from)
            var rookFromPos = coordsToPos(files.indexOf(rookSq.charAt(0)), 8 - parseInt(rookSq.charAt(1)));
            var rookToPos   = coordsToPos(rookTargetFileIndex, 8 - (isWhite ? 1 : 8));

            // animate rook synchronized with king
            rookLayer.property("Position").setValueAtTime(timeCursor, rookFromPos);
            rookLayer.property("Position").setValueAtTime(timeCursor + moveDuration, rookToPos);

            // update mapping: remove old rook key and set new
            delete pieceLayersBySquare[rookSq];
           pieceLayersBySquare[rookTargetSquare] = {
    layer: rookLayer,
    piece: rookObj.piece || "r",
    color: rookObj.color || (isWhite ? "white" : "black"),
    id: rookObj.id
};

           
        }
    }

    // --- update mapping for moving piece AFTER capture & castling handling ---
    pieceLayersBySquare[toSq] = {
    layer: pieceLayer,
    piece: pieceObj.piece,
    color: pieceObj.color,
    id: pieceObj.id
};
delete pieceLayersBySquare[fromSq];

    timeCursor += moveDuration + gapBetweenMoves;

}


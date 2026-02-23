#!/usr/bin/env python3
import os, io, json, sys
import chess, chess.pgn

def read_input(prompt):
    try:
        return input(prompt).strip()
    except KeyboardInterrupt:
        sys.exit(1)

def parse_game_or_san(pgn_text, start_fen):
    # try full PGN
    g = chess.pgn.read_game(io.StringIO(pgn_text))
    board = chess.Board(start_fen)
    moves = []
    if g:
        for mv in g.mainline_moves():
            moves.append((board.copy(), mv))
            board.push(mv)
        return moves
    # fallback: parse SAN tokens
    toks = [t for t in pgn_text.replace("\n"," ").split(" ") if t and not (t.endswith('.') and t[:-1].isdigit()) and t not in ("1-0","0-1","1/2-1/2","*")]
    board = chess.Board(start_fen)
    for t in toks:
        mv = board.parse_san(t)
        moves.append((board.copy(), mv))
        board.push(mv)
    return moves

def mv_to_obj(board_before, mv):
    fr = chess.square_name(mv.from_square)
    to = chess.square_name(mv.to_square)
    capture = board_before.is_capture(mv)
    obj = {"from_square": fr, "to_square": to, "capture": bool(capture)}
    # captured square (handles en-passant)
    if capture:
        if board_before.piece_at(mv.to_square):
            obj["captured_piece_square"] = chess.square_name(mv.to_square)
        elif board_before.is_en_passant(mv):
            idx = mv.to_square - 8 if board_before.turn == chess.WHITE else mv.to_square + 8
            obj["captured_piece_square"] = chess.square_name(idx)
        else:
            obj["captured_piece_square"] = chess.square_name(mv.to_square)
    # promotion
        # promotion
    if mv.promotion:
        map_p = {
            chess.QUEEN: "q",
            chess.ROOK: "r",
            chess.BISHOP: "b",
            chess.KNIGHT: "n"
        }
        promo = map_p.get(mv.promotion)
        obj["promotion"] = promo
        obj["promotion_square"] = chess.square_name(mv.to_square)
        obj["promotion_color"] = "white" if board_before.turn == chess.WHITE else "black"

        
    # castling detection (king moves two files)
    piece = board_before.piece_at(mv.from_square)
    if piece and piece.piece_type == chess.KING:
        if abs(chess.square_file(mv.to_square) - chess.square_file(mv.from_square)) == 2:
            obj["castle"] = "king_side" if chess.square_file(mv.to_square) > chess.square_file(mv.from_square) else "queen_side"
    return obj

def main():
    pgn_input = read_input("Paste PGN moves or path to .pgn (press Enter when done):\n")
    if os.path.exists(pgn_input):
        with open(pgn_input, "r", encoding="utf-8") as f: pgn_text = f.read()
    else:
        pgn_text = pgn_input
    fen = read_input("Enter starting FEN (leave blank for standard start): ")
    if not fen: fen = chess.STARTING_FEN
    # validate fen
    try:
        chess.Board(fen)
    except Exception as e:
        print("Invalid FEN:", e); sys.exit(1)
    try:
        moves_pairs = parse_game_or_san(pgn_text, fen)
    except Exception as e:
        print("Failed to parse PGN/SAN:", e); sys.exit(1)
    out_moves = [mv_to_obj(b, m) for (b,m) in moves_pairs]
    out = {"startFEN": fen, "moves": out_moves}
    with open("timeline.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print("Wrote timeline.json — moves:", len(out_moves))

if __name__ == "__main__":
    main()

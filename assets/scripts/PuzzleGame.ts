import { _decorator, Animation, AudioSource, Button, Component, instantiate, Label, Mask, Node, Prefab, Rect, Sprite, SpriteFrame, Texture2D, tween, UIOpacity, UITransform, v3, Vec3 } from "cc";
const { ccclass, property } = _decorator;

enum SlidingState {
    ALLOW_CLICK = 0,
    TWEENING = 1,
}

@ccclass("PuzzleGame")
export class PuzzleGame extends Component {
    @property({ type: [SpriteFrame] })
    public photos: SpriteFrame[] = []; // 被切图像资源（Inspector 里拖 SpriteFrame）

    @property({ type: Prefab })
    public tilePrefab: Prefab | null = null; // 预制体：包含 Sprite

    @property({ tooltip: "shuffle iterations for initial scramble" })
    public initialIterations = 10;

    @property({ tooltip: "shuffle tween duration (ms)" })
    public shuffleSpeed = 200;

    @property({ tooltip: "slide tween duration (ms)" })
    public slideSpeed = 300;

    @property({ tooltip: "ease name (string) — using tween easing preset" })
    public slideEase = "backOut";

    @property({ tooltip: "gap between tiles (pixels)" })
    public spacing = 0;

    @property(Node)
    public maskNode: Node | null = null;
    @property(Node)
    public logoNode: Node | null = null;
    @property(Node)
    touchBtnNode: Node | null = null;
    @property(Label)
    public clickLabel: Label | null = null;

    // internal
    private rows = 0;
    private cols = 0;
    private pieceWidth = 0;
    private pieceHeight = 0;
    @property(Node)
    private piecesContainer: Node | null = null;
    private slices: SpriteFrame[] = [];
    private spacer: Node | null = null;

    private lastMove: number | null = null;
    private iterationsLeft = 0;
    private action: SlidingState = SlidingState.TWEENING;

    private currentPhotoIndex = 0;

    private allowClick = true;

    private readyToNextRound = false;

    onLoad() {
        if (!this.tilePrefab) {
            console.error("PuzzleGame: tilePrefab is required.");
            return;
        }

        // create container
        if (!this.piecesContainer) {
            this.piecesContainer = new Node("Pieces");
            this.node.addChild(this.piecesContainer);
            // place container center by default
            const ut = this.piecesContainer.addComponent(UITransform);
            ut.width = 800;
            ut.height = 600;
            this.piecesContainer.setPosition(new Vec3(0, 0, 0));
        }
        this.clickLabel.node.active = false;
        this.logoNode.active = false;
    }

    start() {
        this.allowClick = false;
        // start with first photo if exists
        if (this.photos.length === 0) {
            console.error("PuzzleGame: please assign at least one SpriteFrame into photos[]");
            return;
        }

        // start with a default 3x3
        // this.startPuzzle(this.currentPhotoIndex, 3, 3, this.initialIterations);
        this.showStart();
    }

    onSceneClick() {
        if (!this.allowClick) {
            return;
        }
        this.clickLabel.node.active = false;
        if (this.readyToNextRound) {
            this.nextRound();
            return;
        }
        this.logoNode.active = false;
        this.maskNode.getComponent(Animation).play("maskAppear");
        this.scheduleOnce(() => {
            this.touchBtnNode.active = false;
            this.startPuzzle(this.currentPhotoIndex, 3, 3, this.initialIterations);
        }, 1);
    }

    showStart() {
        this.logoNode.active = true;
        const ani = this.logoNode.getComponent(Animation);
        ani.play();
        this.scheduleOnce(() => {
            this.clickLabel.node.active = true;
            this.allowClick = true;
        }, 2);
    }

    /**
     * Start puzzle for a given photo index and rows/cols
     */
    public async startPuzzle(photoIndex: number, rows: number, cols: number, iterations = 10) {
        if (!this.photos[photoIndex]) {
            console.error("PuzzleGame: photo index out of range");
            return;
        }

        this.currentPhotoIndex = photoIndex;
        this.rows = rows;
        this.cols = cols;
        this.iterationsLeft = iterations;

        const spriteFrame = this.photos[photoIndex];

        // compute piece size in pixels
        // NOTE: spriteFrame.texture may be lazily loaded — ensure texture ready
        const tex = spriteFrame.texture as Texture2D;
        if (!tex) {
            console.error("PuzzleGame: spriteFrame texture missing");
            return;
        }

        const fullW = spriteFrame.rect ? spriteFrame.rect.width : tex.width;
        const fullH = spriteFrame.rect ? spriteFrame.rect.height : tex.height;

        // piece pixel size
        this.pieceWidth = Math.floor(fullW / this.rows);
        this.pieceHeight = Math.floor(fullH / this.cols);

        // cleanup old
        this.clearPieces();

        // create sprite slices (dynamic spriteframes)
        this.slices = [];
        for (let y = 0; y < this.cols; y++) {
            for (let x = 0; x < this.rows; x++) {
                const rect = new Rect(x * this.pieceWidth, y * this.pieceHeight, this.pieceWidth, this.pieceHeight);

                // create SpriteFrame for sub-rect — API note: depending on CC small version you might need different setter names
                const sf = new SpriteFrame();
                // attach same texture
                (sf as any).texture = tex; // use `texture` field; some versions use _texture or setTexture. Adjust if needed.
                // set rect
                (sf as any).rect = rect; // some versions may require sf.setRect(rect)
                // set rotated / offset if necessary
                this.slices.push(sf);
            }
        }

        // instantiate tiles
        const total = this.rows * this.cols;
        // compute grid dims to center
        const gridWidth = this.rows * this.pieceWidth + (this.rows - 1) * this.spacing;
        const gridHeight = this.cols * this.pieceHeight + (this.cols - 1) * this.spacing;

        const startX = -gridWidth / 2 + this.pieceWidth / 2;
        const startY = gridHeight / 2 - this.pieceHeight / 2;

        for (let i = 0; i < total; i++) {
            const node = instantiate(this.tilePrefab!);
            node.name = `Tile_${i}`;
            this.piecesContainer!.addChild(node);

            const row = Math.floor(i / this.rows);
            const col = i % this.rows;
            const posX = startX + col * (this.pieceWidth + this.spacing);
            const posY = startY - row * (this.pieceHeight + this.spacing);
            node.setPosition(v3(posX, posY, 0));

            const sp = node.getComponent(Sprite);
            if (sp) {
                // last tile is spacer
                if (i === total - 1) {
                    sp.enabled = false;
                    this.spacer = node;
                } else {
                    sp.spriteFrame = this.slices[i];
                    sp.enabled = true;
                }
            }

            // store metadata in Node via name and custom props
            (node as any).__row = row;
            (node as any).__col = col;
            (node as any).__correctRow = row;
            (node as any).__correctCol = col;
            (node as any).__origIndex = i;
            node.on(Node.EventType.MOUSE_DOWN, () => this.onPieceClicked(node));
        }

        // start shuffle via walker
        this.shufflePieces();
    }

    clearPieces() {
        if (this.piecesContainer) {
            // this.piecesContainer.removeAllChildren(true);
            this.piecesContainer.removeAllChildren();
        }
        this.slices = [];
        this.spacer = null;
    }

    /**
     * shuffle walker — make valid non-repeating random moves
     */
    shufflePieces() {
        // if iterations zero => start play
        if (this.iterationsLeft <= 0) {
            this.startPlay();
            return;
        }

        // build moves list respecting lastMove to avoid immediate undo
        const moves: number[] = [];
        const spacerRow = (this.spacer as any).__row;
        const spacerCol = (this.spacer as any).__col;

        // using direction constants: 0=UP,1=DOWN,2=LEFT,3=RIGHT
        const UP = 0,
            DOWN = 1,
            LEFT = 2,
            RIGHT = 3;

        if (spacerCol > 0 && this.lastMove !== DOWN) moves.push(UP); // piece above moves down into spacer
        if (spacerCol < this.cols - 1 && this.lastMove !== UP) moves.push(DOWN);
        if (spacerRow > 0 && this.lastMove !== RIGHT) moves.push(LEFT);
        if (spacerRow < this.rows - 1 && this.lastMove !== LEFT) moves.push(RIGHT);

        const pick = moves[Math.floor(Math.random() * moves.length)];
        this.lastMove = pick;

        // compute target piece coords to swap with spacer
        let targetR = spacerRow,
            targetC = spacerCol;
        switch (pick) {
            case UP:
                targetC = spacerCol - 1;
                break;
            case DOWN:
                targetC = spacerCol + 1;
                break;
            case LEFT:
                targetR = spacerRow - 1;
                break;
            case RIGHT:
                targetR = spacerRow + 1;
                break;
        }

        // perform immediate swap (with tween depending on shuffleSpeed)
        const piece = this.getPieceByRC(targetR, targetC);
        if (!piece) return;

        // target position for spacer
        const oldSpacerPos = this.spacer!.getPosition();
        const targetPos = piece.getPosition();

        // update metadata
        (piece as any).__row = spacerRow;
        (piece as any).__col = spacerCol;
        (this.spacer as any).__row = targetR;
        (this.spacer as any).__col = targetC;

        // move spacer instantly to piece position and piece to spacer
        if (this.shuffleSpeed === 0) {
            piece.setPosition(oldSpacerPos);
            this.spacer!.setPosition(targetPos);
            this.iterationsLeft--;
            this.shufflePieces();
        } else {
            tween(piece)
                .to(this.shuffleSpeed / 1000, { position: v3(oldSpacerPos) })
                .call(() => {
                    this.spacer!.setPosition(targetPos);
                    this.iterationsLeft--;
                    this.shufflePieces();
                })
                .start();
        }
    }

    getPieceByRC(r: number, c: number): Node | null {
        for (let i = 0; i < this.piecesContainer!.children.length; i++) {
            const n = this.piecesContainer!.children[i];
            if ((n as any).__row === r && (n as any).__col === c) return n;
        }
        return null;
    }

    startPlay() {
        this.action = SlidingState.ALLOW_CLICK;
    }

    // 修正核心在于 swap / slide 时 metadata 行列更新与 position 对齐
    onPieceClicked(piece: Node) {
        if (this.action !== SlidingState.ALLOW_CLICK) return;

        const spacer = this.spacer!;
        const pr = (piece as any).__row;
        const pc = (piece as any).__col;
        const sr = (spacer as any).__row;
        const sc = (spacer as any).__col;

        const piecePos = piece.getPosition();
        const spacerPos = spacer.getPosition();
        if (pr === sr) {
            if (sc === pc - 1) {
                //  Space above the piece?
                (piece as any).__col--;
                (spacer as any).__col++;
                // spacer.setPosition(spacerPos.x, spacerPos.y + this.pieceHeight);
                spacer.setPosition(spacerPos.x + this.pieceWidth, spacerPos.y);
                this.slidePiece(piece, new Vec3(piecePos.x - this.pieceWidth, piecePos.y));
            } else if (sc === pc + 1) {
                (piece as any).__col++;
                (spacer as any).__col--;
                spacer.setPosition(spacerPos.x - this.pieceWidth, spacerPos.y);
                this.slidePiece(piece, new Vec3(piecePos.x + this.pieceWidth, piecePos.y));
            }
        } else if (pc === sc) {
            if (sr === pr - 1) {
                (piece as any).__row--;
                (spacer as any).__row++;
                spacer.setPosition(spacerPos.x, spacerPos.y - this.pieceHeight);
                this.slidePiece(piece, new Vec3(piecePos.x, piecePos.y + this.pieceHeight));
            } else if (sr === pr + 1) {
                //  Space to the right of the piece?
                (piece as any).__row++;
                (spacer as any).__row--;
                spacer.setPosition(spacerPos.x, spacerPos.y + this.pieceHeight);

                this.slidePiece(piece, new Vec3(piecePos.x, piecePos.y - this.pieceHeight));
            }
        }
    }

    slidePiece(piece: Node, targetPos: Vec3) {
        this.action = SlidingState.TWEENING;

        tween(piece)
            .to(this.slideSpeed / 1000, { position: targetPos }, { easing: this.slideEase as any })
            .call(() => {
                this.onTweenOver();
            })
            .start();
    }

    onTweenOver() {
        // 检查是否完成
        let outOfSequence = false;
        for (let i = 0; i < this.piecesContainer!.children.length; i++) {
            const node = this.piecesContainer!.children[i];
            if ((node as any).__row !== (node as any).__correctRow || (node as any).__col !== (node as any).__correctCol) {
                outOfSequence = true;
                break;
            }
        }

        if (outOfSequence) {
            this.action = SlidingState.ALLOW_CLICK;
        } else {
            // solved
            // reveal spacer
            const spSprite = this.spacer!.getComponent(Sprite);
            if (spSprite) {
                spSprite.enabled = true;
                spSprite.spriteFrame = this.slices[this.rows * this.cols - 1]; // last frame
                const opacity = spSprite.getComponent(UIOpacity);
                if (opacity) {
                    opacity.opacity = 0;
                }
            }
            // play win sound
            const audio = this.node.getComponent(AudioSource);
            if (audio) {
                audio.play();
            }

            this.clickLabel.node.active = true;
            this.readyToNextRound = true;
            this.touchBtnNode.active = true;
        }
    }

    revealSpacer() {
        if (!this.spacer) return;
        const sp = this.spacer.getComponent(Sprite);
        if (sp) {
            sp.enabled = true;
            sp.spriteFrame = this.slices[this.rows * this.cols - 1];
        }
        this.action = SlidingState.ALLOW_CLICK;
        // 触发胜利动画或下一轮逻辑
        // this.nextRound();
        this.clickLabel.node.active = true;
    }

    /**
     * nextRound: switch to next photo & increase complexity like original
     */
    nextRound() {
        // choose nextPhoto & difficulty
        this.touchBtnNode.active = false;
        let nextIndex = (this.currentPhotoIndex + 1) % this.photos.length;
        let size = 3;
        let iterations = 10;
        if (nextIndex === 1) {
            size = 4;
            iterations = 20;
        } else if (nextIndex === 2) {
            size = 5;
            iterations = 30;
        }

        // optional reveal animation with wipe controlled by FilterWipe
        // destroy previous pieces
        this.clearPieces();

        // start new puzzle
        this.startPuzzle(nextIndex, size, size, iterations);
    }
}

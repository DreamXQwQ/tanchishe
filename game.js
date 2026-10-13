(function () {
    'use strict';

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('high-score');
    const speedEl = document.getElementById('speed');
    const enemyCountEl = document.getElementById('enemy-count');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayMessage = document.getElementById('overlay-message');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const dirBtns = document.querySelectorAll('.dir-btn');

    const GRID_SIZE = 16;                     // 每格 16px，画布 800px → 50 x 50 格
    const TILE_COUNT = canvas.width / GRID_SIZE;
    const BASE_SPEED = 140; // ms per frame
    const MIN_SPEED = 60;

    // ===== 果实配置 =====
    const FOOD_BASE = 15;                     // 基础果实数量（大地图需要更多）
    const FOOD_PER_ENEMY = 5;                 // 每个敌人在场额外增加的果实

    // ===== AI 敌人配置（平衡性参数） =====
    const MAX_ENEMIES = 3;                    // 最多 3 个敌人
    const ENEMY_SPAWN_COOLDOWN = 3000;        // 敌人死亡后补充冷却（ms）
    const ENEMY_STAGE_TIMES = [25000, 50000]; // 25 秒后 2 个，50 秒后 3 个
    const AI_MAX_LEN = 20;                    // AI 最大长度，避免变成"巨墙"堵死地图
    const AI_RANDOM_MOVE = 0.12;              // AI 犯迷糊概率，避免太聪明抢光食物
    const ENEMY_MIN_SPAWN_DIST = 10;          // 敌人出生点离玩家的最小距离

    const PLAYER_THEME = {
        head: '#00ff88',
        body: r => `rgb(0, ${Math.floor(255 * r)}, 136)`
    };
    const ENEMY_THEMES = [
        { head: '#ff4757', body: r => `rgb(${Math.floor(255 * r)}, 70, 90)` },     // 红
        { head: '#ffa502', body: r => `rgb(${Math.floor(255 * r)}, ${Math.floor(165 * r)}, 20)` }, // 橙
        { head: '#a55eea', body: r => `rgb(${Math.floor(190 * r)}, ${Math.floor(110 * r)}, 235)` } // 紫
    ];

    let snake, direction, nextDirection, foods, enemies, score, highScore, speedLevel, gameLoop, isRunning, isPaused;
    let elapsed, lastEnemySpawnAt, enemySeq;

    // 初始化最高分
    highScore = parseInt(localStorage.getItem('snake_high_score') || '0', 10);
    highScoreEl.textContent = highScore;

    function init() {
        const mid = Math.floor(TILE_COUNT / 2);
        snake = [
            { x: mid, y: mid },
            { x: mid - 1, y: mid },
            { x: mid - 2, y: mid }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        foods = [];
        enemies = [];
        elapsed = 0;
        enemySeq = 0;
        score = 0;
        speedLevel = 1;
        scoreEl.textContent = score;
        speedEl.textContent = speedLevel;
        spawnEnemy(); // 开局 1 个敌人
        lastEnemySpawnAt = 0;
        syncFood();   // 食物数量 = 场上蛇的数量，保证玩家有得吃
        updateEnemyCountUI();
    }

    // ===== 食物 =====
    function spawnFood() {
        for (let attempt = 0; attempt < 200; attempt++) {
            const f = {
                x: Math.floor(Math.random() * TILE_COUNT),
                y: Math.floor(Math.random() * TILE_COUNT)
            };
            if (isOnSnake(f.x, f.y)) continue;
            if (foods.some(o => o.x === f.x && o.y === f.y)) continue;
            foods.push(f);
            return;
        }
    }

    function syncFood() {
        // 基础果实 + 每个敌人额外果实，避免敌人抢光后玩家挨饿
        while (foods.length < FOOD_BASE + enemies.length * FOOD_PER_ENEMY) spawnFood();
    }

    // ===== AI 敌人 =====
    function desiredEnemyCount() {
        let n = 1;
        if (elapsed >= ENEMY_STAGE_TIMES[0]) n = 2;
        if (elapsed >= ENEMY_STAGE_TIMES[1]) n = 3;
        return Math.min(n, MAX_ENEMIES);
    }

    function spawnEnemy() {
        if (enemies.length >= MAX_ENEMIES) return;
        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        for (let attempt = 0; attempt < 40; attempt++) {
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const hx = Math.floor(Math.random() * TILE_COUNT);
            const hy = Math.floor(Math.random() * TILE_COUNT);
            const body = [
                { x: hx, y: hy },
                { x: hx - dir.x, y: hy - dir.y },
                { x: hx - dir.x * 2, y: hy - dir.y * 2 }
            ];
            // 出界 / 离玩家太近 / 压到蛇身 都重试
            if (body.some(s => s.x < 0 || s.x >= TILE_COUNT || s.y < 0 || s.y >= TILE_COUNT)) continue;
            if (Math.abs(hx - snake[0].x) + Math.abs(hy - snake[0].y) < ENEMY_MIN_SPAWN_DIST) continue;
            if (body.some(s => isOnSnake(s.x, s.y))) continue;
            enemies.push({ body, dir, theme: enemySeq++ % ENEMY_THEMES.length, dead: false });
            return;
        }
    }

    function isOnSnake(x, y) {
        if (snake.some(s => s.x === x && s.y === y)) return true;
        return enemies.some(e => e.body.some(s => s.x === x && s.y === y));
    }

    // AI 视角的障碍物：玩家 + 其他敌人
    function isOccupiedForAI(x, y, self) {
        if (snake.some(s => s.x === x && s.y === y)) return true;
        return enemies.some(e => e !== self && e.body.some(s => s.x === x && s.y === y));
    }

    function aiChooseDir(e) {
        const head = e.body[0];
        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        // 禁止掉头
        const options = dirs.filter(d => !(d.x === -e.dir.x && d.y === -e.dir.y));
        // 只保留安全方向（边界可穿越，只需不撞自己、不撞其他蛇）
        const safe = options.filter(d => {
            const nx = (head.x + d.x + TILE_COUNT) % TILE_COUNT;
            const ny = (head.y + d.y + TILE_COUNT) % TILE_COUNT;
            if (e.body.slice(0, -1).some(s => s.x === nx && s.y === ny)) return false;
            return !isOccupiedForAI(nx, ny, e);
        });
        if (safe.length === 0) {
            // 走投无路，随便走（下一帧就死了）
            return options[Math.floor(Math.random() * options.length)];
        }
        // 小概率随机走，让 AI 不那么完美（平衡）
        if (Math.random() < AI_RANDOM_MOVE) {
            return safe[Math.floor(Math.random() * safe.length)];
        }
        // 朝最近的食物走
        let target = null, best = Infinity;
        for (const f of foods) {
            const d = Math.abs(f.x - head.x) + Math.abs(f.y - head.y);
            if (d < best) { best = d; target = f; }
        }
        if (!target) return safe[0];
        let bestDir = safe[0], bestDist = Infinity;
        for (const d of safe) {
            const dist = Math.abs(target.x - (head.x + d.x)) + Math.abs(target.y - (head.y + d.y));
            if (dist < bestDist) { bestDist = dist; bestDir = d; }
        }
        return bestDir;
    }

    function aiMove(e) {
        e.dir = aiChooseDir(e);
        // 边界穿越：从另一头钻出来
        const head = {
            x: (e.body[0].x + e.dir.x + TILE_COUNT) % TILE_COUNT,
            y: (e.body[0].y + e.dir.y + TILE_COUNT) % TILE_COUNT
        };

        const hitSelf = e.body.slice(0, -1).some(s => s.x === head.x && s.y === head.y);
        if (hitSelf || isOccupiedForAI(head.x, head.y, e)) {
            e.dead = true; // AI 撞死，之后由冷却机制补充
            return;
        }

        e.body.unshift(head);

        // AI 也会吃球（和玩家抢）
        const fi = foods.findIndex(f => f.x === head.x && f.y === head.y);
        if (fi >= 0) {
            foods.splice(fi, 1);
            spawnFood();
            if (e.body.length > AI_MAX_LEN) e.body.pop(); // 限制最大长度
        } else {
            e.body.pop();
        }
    }

    function updateEnemyCountUI() {
        enemyCountEl.textContent = enemies.length;
    }

    // ===== 游戏主流程 =====
    function startGame() {
        clearInterval(gameLoop);
        init();
        isRunning = true;
        isPaused = false;
        hideOverlay();
        gameLoop = setInterval(tick, getSpeed());
    }

    function getSpeed() {
        return Math.max(MIN_SPEED, BASE_SPEED - (speedLevel - 1) * 10);
    }

    function tick() {
        if (isPaused) return;

        elapsed += getSpeed();

        // 敌人随时间增多（最多 3 个），死亡后也会按冷却补充
        if (enemies.length < desiredEnemyCount() && elapsed - lastEnemySpawnAt >= ENEMY_SPAWN_COOLDOWN) {
            spawnEnemy();
            lastEnemySpawnAt = elapsed;
        }

        direction = nextDirection;

        // 边界穿越：碰到边界不死，从对面另一头钻出来
        const head = {
            x: (snake[0].x + direction.x + TILE_COUNT) % TILE_COUNT,
            y: (snake[0].y + direction.y + TILE_COUNT) % TILE_COUNT
        };

        // 撞自己检测
        if (snake.some(s => s.x === head.x && s.y === head.y)) {
            return gameOver();
        }

        // 撞 AI 敌人检测
        if (enemies.some(e => e.body.some(s => s.x === head.x && s.y === head.y))) {
            return gameOver('enemy');
        }

        snake.unshift(head);

        // 玩家吃食物
        const fi = foods.findIndex(f => f.x === head.x && f.y === head.y);
        if (fi >= 0) {
            score += 10;
            scoreEl.textContent = score;
            foods.splice(fi, 1);
            spawnFood();

            // 每吃 5 个食物升一级速度
            if (score % 50 === 0) {
                speedLevel++;
                speedEl.textContent = speedLevel;
                clearInterval(gameLoop);
                gameLoop = setInterval(tick, getSpeed());
            }
        } else {
            snake.pop();
        }

        // AI 敌人行动
        enemies.forEach(aiMove);
        enemies = enemies.filter(e => !e.dead);

        syncFood();
        updateEnemyCountUI();
        draw();
    }

    function gameOver(cause) {
        clearInterval(gameLoop);
        isRunning = false;

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snake_high_score', highScore);
            highScoreEl.textContent = highScore;
            showOverlay('🎉 新纪录!', `最终得分: ${score}`);
        } else {
            const title = cause === 'enemy' ? '🤖 被 AI 敌人撞到' : '💀 游戏结束';
            showOverlay(title, `得分: ${score}`);
        }
    }

    function togglePause() {
        if (!isRunning) return;
        isPaused = !isPaused;
        if (isPaused) {
            showOverlay('⏸️ 已暂停', '按 空格键 或 继续按钮 恢复');
        } else {
            hideOverlay();
        }
    }

    // ===== 绘制 =====
    function draw() {
        // 清空画布
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制网格（淡淡的）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= TILE_COUNT; i++) {
            ctx.beginPath();
            ctx.moveTo(i * GRID_SIZE, 0);
            ctx.lineTo(i * GRID_SIZE, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * GRID_SIZE);
            ctx.lineTo(canvas.width, i * GRID_SIZE);
            ctx.stroke();
        }

        // 绘制所有食物
        foods.forEach(f => {
            const fx = f.x * GRID_SIZE + GRID_SIZE / 2;
            const fy = f.y * GRID_SIZE + GRID_SIZE / 2;
            const grd = ctx.createRadialGradient(fx, fy, 1, fx, fy, GRID_SIZE / 2);
            grd.addColorStop(0, '#ff6b6b');
            grd.addColorStop(1, '#ee0055');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(fx, fy, GRID_SIZE / 2 - 1, 0, Math.PI * 2);
            ctx.fill();
        });

        // 先画敌人，再画玩家（玩家在上层）
        enemies.forEach(e => drawSnake(e.body, e.dir, ENEMY_THEMES[e.theme]));
        drawSnake(snake, direction, PLAYER_THEME);
    }

    function drawSnake(body, dir, theme) {
        body.forEach((segment, index) => {
            const isHead = index === 0;
            const x = segment.x * GRID_SIZE;
            const y = segment.y * GRID_SIZE;
            const padding = 1;

            if (isHead) {
                // 蛇头
                ctx.fillStyle = theme.head;
                roundRect(ctx, x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2, GRID_SIZE * 0.3);
                ctx.fill();

                // 眼睛（尺寸随格子大小缩放）
                ctx.fillStyle = '#0a0a1a';
                const eyeSize = Math.max(0.8, GRID_SIZE * 0.16);
                const eyeOffset = GRID_SIZE * 0.28;
                let ex1, ey1, ex2, ey2;
                if (dir.x === 1) {
                    ex1 = x + GRID_SIZE - eyeOffset; ey1 = y + eyeOffset;
                    ex2 = x + GRID_SIZE - eyeOffset; ey2 = y + GRID_SIZE - eyeOffset;
                } else if (dir.x === -1) {
                    ex1 = x + eyeOffset; ey1 = y + eyeOffset;
                    ex2 = x + eyeOffset; ey2 = y + GRID_SIZE - eyeOffset;
                } else if (dir.y === 1) {
                    ex1 = x + eyeOffset; ey1 = y + GRID_SIZE - eyeOffset;
                    ex2 = x + GRID_SIZE - eyeOffset; ey2 = y + GRID_SIZE - eyeOffset;
                } else {
                    ex1 = x + eyeOffset; ey1 = y + eyeOffset;
                    ex2 = x + GRID_SIZE - eyeOffset; ey2 = y + eyeOffset;
                }
                ctx.beginPath();
                ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2);
                ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 蛇身（渐变）
                const ratio = 1 - index / body.length * 0.5;
                ctx.fillStyle = theme.body(ratio);
                roundRect(ctx, x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2, GRID_SIZE * 0.2);
                ctx.fill();
            }
        });
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function changeDirection(dx, dy) {
        // 禁止 180 度掉头
        if (direction.x + dx === 0 && direction.y + dy === 0) return;
        nextDirection = { x: dx, y: dy };
    }

    function showOverlay(title, message) {
        overlayTitle.textContent = title;
        overlayMessage.textContent = message;
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    // 键盘控制
    document.addEventListener('keydown', function (e) {
        const key = e.key.toLowerCase();
        switch (key) {
            case 'arrowup':
            case 'w':
                e.preventDefault();
                changeDirection(0, -1);
                break;
            case 'arrowdown':
            case 's':
                e.preventDefault();
                changeDirection(0, 1);
                break;
            case 'arrowleft':
            case 'a':
                e.preventDefault();
                changeDirection(-1, 0);
                break;
            case 'arrowright':
            case 'd':
                e.preventDefault();
                changeDirection(1, 0);
                break;
            case ' ':
                e.preventDefault();
                if (!isRunning) {
                    startGame();
                } else {
                    togglePause();
                }
                break;
        }
    });

    // 按钮
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);

    dirBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const dir = btn.dataset.dir;
            switch (dir) {
                case 'up': changeDirection(0, -1); break;
                case 'down': changeDirection(0, 1); break;
                case 'left': changeDirection(-1, 0); break;
                case 'right': changeDirection(1, 0); break;
            }
        });
    });

    // 触摸滑动支持
    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', function (e) {
        if (!isRunning || isPaused) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            changeDirection(dx > 0 ? 1 : -1, 0);
        } else {
            changeDirection(0, dy > 0 ? 1 : -1);
        }
    }, { passive: true });

    // 初始画面
    init();
    draw();
})();

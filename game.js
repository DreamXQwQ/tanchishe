(function () {
    'use strict';

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('high-score');
    const speedEl = document.getElementById('speed');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayMessage = document.getElementById('overlay-message');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const dirBtns = document.querySelectorAll('.dir-btn');

    const GRID_SIZE = 20;
    const TILE_COUNT = canvas.width / GRID_SIZE;
    const BASE_SPEED = 140; // ms per frame
    const MIN_SPEED = 60;

    let snake, direction, nextDirection, food, score, highScore, speedLevel, gameLoop, isRunning, isPaused;

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
        score = 0;
        speedLevel = 1;
        scoreEl.textContent = score;
        speedEl.textContent = speedLevel;
        placeFood();
    }

    function placeFood() {
        while (true) {
            food = {
                x: Math.floor(Math.random() * TILE_COUNT),
                y: Math.floor(Math.random() * TILE_COUNT)
            };
            // 确保食物不在蛇身上
            if (!snake.some(s => s.x === food.x && s.y === food.y)) {
                break;
            }
        }
    }

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

        direction = nextDirection;

        const head = {
            x: snake[0].x + direction.x,
            y: snake[0].y + direction.y
        };

        // 撞墙检测
        if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
            return gameOver();
        }

        // 撞自己检测
        if (snake.some(s => s.x === head.x && s.y === head.y)) {
            return gameOver();
        }

        snake.unshift(head);

        // 吃食物
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            scoreEl.textContent = score;
            placeFood();

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

        draw();
    }

    function gameOver() {
        clearInterval(gameLoop);
        isRunning = false;

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snake_high_score', highScore);
            highScoreEl.textContent = highScore;
            showOverlay('🎉 新纪录!', `最终得分: ${score}`);
        } else {
            showOverlay('💀 游戏结束', `得分: ${score}`);
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

        // 绘制食物
        const fx = food.x * GRID_SIZE + GRID_SIZE / 2;
        const fy = food.y * GRID_SIZE + GRID_SIZE / 2;
        const grd = ctx.createRadialGradient(fx, fy, 2, fx, fy, GRID_SIZE / 2);
        grd.addColorStop(0, '#ff6b6b');
        grd.addColorStop(1, '#ee0055');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(fx, fy, GRID_SIZE / 2 - 2, 0, Math.PI * 2);
        ctx.fill();

        // 绘制蛇
        snake.forEach((segment, index) => {
            const isHead = index === 0;
            const x = segment.x * GRID_SIZE;
            const y = segment.y * GRID_SIZE;
            const padding = 1;

            if (isHead) {
                // 蛇头
                ctx.fillStyle = '#00ff88';
                roundRect(ctx, x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2, 6);
                ctx.fill();

                // 眼睛
                ctx.fillStyle = '#0a0a1a';
                const eyeSize = 3;
                const eyeOffset = 5;
                let ex1, ey1, ex2, ey2;
                if (direction.x === 1) {
                    ex1 = x + GRID_SIZE - eyeOffset; ey1 = y + eyeOffset + 1;
                    ex2 = x + GRID_SIZE - eyeOffset; ey2 = y + GRID_SIZE - eyeOffset - 1;
                } else if (direction.x === -1) {
                    ex1 = x + eyeOffset; ey1 = y + eyeOffset + 1;
                    ex2 = x + eyeOffset; ey2 = y + GRID_SIZE - eyeOffset - 1;
                } else if (direction.y === 1) {
                    ex1 = x + eyeOffset + 1; ey1 = y + GRID_SIZE - eyeOffset;
                    ex2 = x + GRID_SIZE - eyeOffset - 1; ey2 = y + GRID_SIZE - eyeOffset;
                } else {
                    ex1 = x + eyeOffset + 1; ey1 = y + eyeOffset;
                    ex2 = x + GRID_SIZE - eyeOffset - 1; ey2 = y + eyeOffset;
                }
                ctx.beginPath();
                ctx.arc(ex1, ey1, eyeSize, 0, Math.PI * 2);
                ctx.arc(ex2, ey2, eyeSize, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 蛇身（渐变）
                const ratio = 1 - index / snake.length * 0.5;
                const g = Math.floor(255 * ratio);
                ctx.fillStyle = `rgb(0, ${g}, 136)`;
                roundRect(ctx, x + padding, y + padding, GRID_SIZE - padding * 2, GRID_SIZE - padding * 2, 4);
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
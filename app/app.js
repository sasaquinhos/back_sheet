document.addEventListener('DOMContentLoaded', () => {
    const ROWS = 9;
    const COLS_PER_BLOCK = 22;
    const TOTAL_COLS = COLS_PER_BLOCK * 2;
    const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    let currentGroup = null;
    let seatData = {}; // {seatId: group}
    let isDragging = false;
    let lastProcessedSeatId = null;
    let dragAction = null; // 'paint' or 'erase'
    let lastX = null;
    let lastY = null;

    const seatGrid = document.getElementById('seat-grid');
    const groupButtons = document.querySelectorAll('.group-btn');
    const specialInputA = document.getElementById('special-input-a');
    const currentGroupDisplay = document.getElementById('current-group-display');
    const colCountInputA = document.getElementById('col-count-a');
    const syncStatus = document.getElementById('sync-status');
    const lockBtn = document.getElementById('lock-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const podiumBtn = document.getElementById('podium-btn');

    // --- Web化対応: API設定 (GAS デプロイ後に URL を差し替えてください) ---
    const API_URL = "https://script.google.com/macros/s/AKfycbz-689FjbDdQ78DXsBFtfqW-e7nevlu4dkLMgSa6qBQN-FaVRnIrTZnf74aiv4oSSW3/exec";

    // 0. データの読込・保存
    async function loadData() {
        if (!API_URL) return;
        setSyncStatus('saving', '読込中...');
        try {
            const res = await fetch(API_URL);
            const json = await res.json();
            if (json.status === "success") {
                // サーバーからデータが取れた場合はそれを反映
                seatData = json.data || {};

                // 初回（データが空）の場合のみ、デフォルト座席を埋める
                if (Object.keys(seatData).length === 0) {
                    fillDefaultSeats();
                }

                Object.entries(seatData).forEach(([id, group]) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.classList.add(`group-${group}`);
                        el.dataset.color = group;
                    }
                });
                updateSummary();
            }
            setSyncStatus('idle', '同期完了');
        } catch (e) {
            console.error(e);
            setSyncStatus('error', '読込失敗');
        }
    }

    let saveTimeout = null;
    function requestSave() {
        if (!API_URL) return;
        setSyncStatus('saving', '保存中...');
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveData, 2000); // 2秒後に保存（頻度を抑える）
    }

    async function saveData() {
        if (!API_URL) return;
        try {
            // no-cors mode では Content-Type: application/json が使えないため
            // 単純な文字列として送信する
            await fetch(API_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "text/plain"
                },
                body: JSON.stringify(seatData)
            });
            setSyncStatus('idle', '保存完了（送信済）');
        } catch (e) {
            console.error(e);
            setSyncStatus('error', '保存失敗');
        }
    }

    function setSyncStatus(type, text) {
        if (!syncStatus) return;
        syncStatus.className = `sync-${type}`;
        syncStatus.textContent = text;
    }

    // 1. 座席の生成
    function createSeats() {
        // 列番号のヘッダーを表示 (上端)
        const emptyCorner = document.createElement('div');
        emptyCorner.className = 'grid-label';
        seatGrid.appendChild(emptyCorner);

        for (let c_index = 1; c_index <= TOTAL_COLS; c_index++) {
            const colLabel = document.createElement('div');
            colLabel.className = 'grid-label col-label';
            colLabel.textContent = 44 + c_index; // 45～88 に変更
            seatGrid.appendChild(colLabel);
        }

        for (let r = 1; r <= ROWS; r++) {
            const rowLabel = document.createElement('div');
            rowLabel.className = 'grid-label row-label';
            rowLabel.textContent = (ROWS - r + 1);
            seatGrid.appendChild(rowLabel);

            for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                const seatId = `block1-r${r}-c${c}`;
                const seat = createSeatElement(seatId, r, c);
                seatGrid.appendChild(seat);
            }
            for (let c = 1; c <= COLS_PER_BLOCK; c++) {
                const seatId = `block2-r${r}-c${c}`;
                const seat = createSeatElement(seatId, r, c + COLS_PER_BLOCK);
                seatGrid.appendChild(seat);
            }
        }

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 初期化が終わったら読込
        loadData();
    }

    function createSeatElement(id, row, col) {
        const div = document.createElement('div');
        div.className = 'seat';
        div.id = id;
        div.title = id;

        // data-row, data-col, data-group 属性を設定
        div.dataset.row = row;
        div.dataset.col = col;
        // グループAの範囲を定義（全座席をグループAとして扱う）
        div.dataset.group = 'A';

        // --- マウス操作 ---
        div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            handleSeatClick(id, true); // 開始フラグ
        });

        div.addEventListener('mouseenter', () => {
            if (isDragging) {
                handleSeatClick(id);
            }
        });

        // --- タッチ操作 (スマホ) ---
        div.addEventListener('touchstart', (e) => {
            // タッチ開始時にマウスイベントの擬似発火を防止
            e.preventDefault();
            isDragging = true;
            const touch = e.touches[0];
            lastX = touch.clientX;
            lastY = touch.clientY;
            handleSeatClick(id, true);
        }, { passive: false });

        return div;
    }

    // 指定された座標の座席を処理
    function processPoint(x, y) {
        const target = document.elementFromPoint(x, y);
        if (target && target.classList.contains('seat')) {
            handleSeatClick(target.id);
        }
    }

    // 前回の座標から現在の座標までを補完して処理
    function processLine(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.ceil(dist / 10); // 10pxごとにサンプリング

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            processPoint(x, y);
        }
    }

    // タッチムーブ（補完処理付き）
    seatGrid.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const touch = e.touches[0];
        const currX = touch.clientX;
        const currY = touch.clientY;

        if (lastX !== null && lastY !== null) {
            processLine(lastX, lastY, currX, currY);
        } else {
            processPoint(currX, currY);
        }

        lastX = currX;
        lastY = currY;
    }, { passive: false });

    // ドラッグ状態のリセット
    function resetDrag() {
        isDragging = false;
        lastProcessedSeatId = null;
        dragAction = null;
        lastX = null;
        lastY = null;
    }

    window.addEventListener('mouseup', resetDrag);
    window.addEventListener('touchend', resetDrag);
    window.addEventListener('touchcancel', resetDrag);

    // 2. グループ選択
    groupButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;

            // アクティブ表示の切り替え
            groupButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentGroup = group;
            const groupName = btn.textContent;
            currentGroupDisplay.textContent = `${groupName}`;

            // ロック解除（色を選択した時点で自動的にロック解除）
            if (lockBtn) {
                lockBtn.classList.remove('locked');
                lockBtn.textContent = 'ロック';
            }

            // Aグループ特有の表示制御
            if (group === 'A') {
                specialInputA.classList.remove('hidden');
                // 少し遅延させて確実にフォーカスを当てる
                setTimeout(() => colCountInputA.focus(), 10);
            } else {
                specialInputA.classList.add('hidden');
            }
        });

    });

    // お立ち台ボタンの処理（ループの外に配置）
    if (podiumBtn) {
        podiumBtn.addEventListener('click', () => {
            currentGroup = 'J';
            currentGroupDisplay.textContent = 'お立ち台 (濃いグレー)';

            // 他のボタンのアクティブ表示を解除
            groupButtons.forEach(b => b.classList.remove('active'));
            specialInputA.classList.add('hidden');

            if (lockBtn) {
                lockBtn.classList.remove('locked');
                lockBtn.textContent = 'ロック';
            }
        });
    }

    // 3. 座席操作処理
    function handleSeatClick(seatId, isStartOfAction = false) {
        // ロック状態（currentGroupがnull）の場合は何もしない
        if (!currentGroup) return;

        // 「中央 (A)」は手動での個別描画・消去を一切禁止する
        if (currentGroup === 'A') return;

        // 同一ドラッグ内（および瞬間の重複イベント）での同一マスの多重処理を徹底防止
        // これにより、タッチとマウスの二重発火による意図しないトグル（反転）を防ぐ
        if (seatId === lastProcessedSeatId) return;

        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;

        // 現在のマスの色を取得（data-color属性から）
        const currentColor = seatEl.dataset.color || '';

        // ドラッグ開始時に「塗る」か「消す」かを決定
        if (isStartOfAction) {
            isDragging = true;
            if (currentColor === currentGroup) {
                dragAction = 'erase';
            } else if (currentColor === '') {
                dragAction = 'paint';
            } else {
                // 他の色が塗られている場合は何もしない
                dragAction = 'doNothing';
            }
        }

        // ドラッグ中かつモードが決まっている場合のみ処理
        if (!isDragging || !dragAction || dragAction === 'doNothing') return;

        lastProcessedSeatId = seatId;

        if (dragAction === 'erase') {
            // 消去モード: 現在の色が選択中のグループと同じ場合のみ消す
            if (currentColor === currentGroup) {
                updateSeat(seatId, null);
            }
        } else if (dragAction === 'paint') {
            // 描画モード: 現在のマスが空の場合のみ塗る
            if (currentColor === '') {
                updateSeat(seatId, currentGroup);
            }
        }
    }

    // ロックボタンの処理
    if (lockBtn) {
        lockBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();

            // ロック状態に入る
            currentGroup = null;
            currentGroupDisplay.textContent = 'ロック中';

            // すべてのグループボタンの選択を解除
            groupButtons.forEach(b => b.classList.remove('active'));

            // Aグループの入力欄を非表示
            specialInputA.classList.add('hidden');

            // ロックボタンの表示を変更
            lockBtn.classList.add('locked');
            lockBtn.textContent = 'ロック中';
        });
    }

    // すべての座席をクリア
    function clearAllSeats() {
        if (!confirm('すべての座席選択を解除してもよろしいですか？（※お立ち台は残ります）')) return;

        // データのリセット
        seatData = {};

        // デフォルト座席（お立ち台）は復活させる
        fillDefaultSeats();

        // 表示のリセットと再反映
        const seats = document.querySelectorAll('.seat');
        seats.forEach(seat => {
            GROUPS.forEach(g => seat.classList.remove(`group-${g}`));
            const id = seat.id;
            if (seatData[id]) {
                seat.classList.add(`group-${seatData[id]}`);
                seat.dataset.color = seatData[id];
            } else {
                seat.dataset.color = '';
            }
        });

        updateSummary();
        requestSave();
    }

    if (clearAllBtn) {
        // PC/スマホ両方で確実に反応させるため pointerdown を使用
        clearAllBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            clearAllSeats();
        });
    }

    // 座席の状態を更新
    function updateSeat(seatId, group) {
        const seatEl = document.getElementById(seatId);
        if (!seatEl) return;

        // 既存のクラスを削除
        GROUPS.forEach(g => seatEl.classList.remove(`group-${g}`));

        // 新しいクラスを追加
        if (group) {
            seatEl.classList.add(`group-${group}`);
            seatEl.dataset.color = group; // data-color属性に色を保存
            seatData[seatId] = group;
        } else {
            seatEl.dataset.color = ''; // data-color属性をクリア
            delete seatData[seatId];
        }

        updateSummary();
        requestSave();
    }

    // デフォルト座席（ラベル2段め、3段めの55列、56列）をお立ち台色（J）で埋める
    function fillDefaultSeats() {
        // 55列: c=11, 56列: c=12 (Block1)
        // ラベル2段め: r=8, 3段め: r=7 (ROWS=9, label = 9-r+1)
        const targets = [
            'block1-r7-c11', 'block1-r7-c12',
            'block1-r8-c11', 'block1-r8-c12'
        ];
        targets.forEach(id => {
            // お立ち台グループ J にセット
            seatData[id] = 'J';
        });
    }

    // 4. Aグループ専用: 列数入力による一括処理（左右対称対応）
    function runGroupAFill() {
        const colCount = parseInt(colCountInputA.value);
        if (isNaN(colCount) || colCount < 0) return;

        // 全体の列は 1〜44
        for (let r = 1; r <= ROWS; r++) {
            for (let c_index = 1; c_index <= TOTAL_COLS; c_index++) {
                const col = c_index;
                // グループAは全体の右端（88番/col=44）から左方向に埋める
                // col=44 が 1番目, col=43 が 2番目... col=1 が 44番目
                let effectiveCol = TOTAL_COLS - (col - 1);

                let seatId;
                if (c_index <= COLS_PER_BLOCK) {
                    seatId = `block1-r${r}-c${c_index}`;
                } else {
                    seatId = `block2-r${r}-c${c_index - COLS_PER_BLOCK}`;
                }

                if (effectiveCol <= colCount) {
                    updateSeat(seatId, 'A');
                } else {
                    if (seatData[seatId] === 'A') {
                        updateSeat(seatId, null);
                    }
                }
            }
        }
    }

    // 入力確定時（エンターキーまたはフォーカスアウト）に実行
    colCountInputA.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            runGroupAFill();
            colCountInputA.blur(); // 入力を確定させる
        }
    });

    colCountInputA.addEventListener('blur', () => {
        runGroupAFill();
    });

    // 5. リアルタイム集計
    function updateSummary() {
        const counts = {};
        GROUPS.forEach(g => counts[g] = 0);

        Object.values(seatData).forEach(group => {
            if (counts[group] !== undefined) {
                counts[group]++;
            }
        });

        // 各ボタンのカウントを更新
        let totalBH = 0;
        GROUPS.forEach(g => {
            const countEl = document.getElementById(`count-${g}`);
            if (g === 'A') {
                // 中央の表示にはお立ち台(J)も合算
                if (countEl) {
                    countEl.textContent = counts['A'] + counts['J'];
                }
            } else if (g !== 'J') {
                // お立ち台以外の通常のグループを表示更新
                if (countEl) {
                    countEl.textContent = counts[g];
                }
                // 中央(A)とお立ち台(J)以外を合計に加算
                totalBH += counts[g];
            }
        });

        // B～H合計を更新
        const totalBHEl = document.getElementById('count-total-BH');
        if (totalBHEl) {
            totalBHEl.textContent = totalBH;
        }
    }

    // 初期化
    createSeats();
    updateSummary();
});

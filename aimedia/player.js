// -- Player --
class Player {
    constructor({ stream,
                    trackClass,
                    websocket,
                    urlEvents,
                    user = {},
                    playlisttoggle = false,
                    onLike = null,
                    onFav = null,
                    onShare = null,
                    onDelete = null,
                    onRemoveTrackFromAir = null,
                    onTrackInfo = null,
                    uploader = null,
                } = {}) {
        if (!window.__audioUnlockInstalled) {
            window.__audioUnlocked = false;

            const unlockAudio = () => {
                const a = document.createElement('audio');
                a.src = "";
                a.play().then(() => {
                    a.pause();
                    window.__audioUnlocked = true;
                    console.log("Telegram WebApp → AUDIO UNLOCKED");
                }).catch(() => {});

                document.removeEventListener('click', unlockAudio, true);
                document.removeEventListener('touchstart', unlockAudio, true);
            };

            document.addEventListener('click', unlockAudio, true);
            document.addEventListener('touchstart', unlockAudio, true);

            window.__audioUnlockInstalled = true;
        }

        this.stream = stream;
        this.websocketUrl = websocket;
        this.trackClass = trackClass;
        this.urlEvents = urlEvents;
        this.mode = 'track';
        this.playlists = {};
        this.container = "";
        this.socket = null;
        this.isPlaying = false;
        this.listeningEventSentForCurrentTrack = false;

        this.uploader = uploader;

        this.pureListeningTime = 0;
        this.lastUpdateTime = 0;
        this.timeListening = 3;
        this.listenLimit = 3;
        this.isRestoringPlayback = false;

        // === НОВЫЕ СВОЙСТВА ГРОМКОСТИ ===
        this.volumeKey = 'playerVolume';
        this.defaultVolume = 0.8;
        this.currentVolume = parseFloat(localStorage.getItem(this.volumeKey)) || this.defaultVolume;
        this.isMuted = false;
        this.savedVolume = this.currentVolume > 0 ? this.currentVolume : this.defaultVolume;
        // ===================================

        // === СВОЙСТВА КОМПАКТНОГО РЕЖИМА ===
        this.compactModeKey = 'playerCompactMode';
        // Загружаем состояние.
        this.isCompactMode = localStorage.getItem(this.compactModeKey) === 'true';
        this.compactControlsContainer = null;
        // ===================================

        // === СВОЙСТВА АВТОВОССТАНОВЛЕНИЯ ===
        this.stalledRecoveryAttempts = 0;
        this.MAX_RECOVERY_ATTEMPTS = 3;
        this.isAttemptingRecovery = false; // Флаг для предотвращения конфликтов
        // ===================================

        // === СВОЙСТВА ДЛЯ СОСТОЯНИЯ МЕЖДУ СТРАНИЦАМИ ===
        this.STATE_KEY = 'playerPlaybackState';
        this.INITIAL_LOAD_KEY = 'playerInitialLoad';
        this.isPersistentPlayback = false; // Флаг для контроля, был ли плеер восстановлен
        // ===================================

        // === НОВЫЕ СВОЙСТВА ДЛЯ СОХРАНЕНИЯ СОСТОЯНИЯ ПРОСЛУШИВАНИЯ ===
        this.listeningStateKey = 'playerListeningEvents';
        // Карта {trackUid: true/false}
        this.listeningEventsSentMap = this._loadListeningState();
        // =============================================================

        this.user = user;
        this.bindShareModalEvents();
        this.bindAssignRadioModalEvents();

        // !!! ИСПРАВЛЕНИЕ: ПРИВЯЗЫВАЕМ АУДИО-ЭЛЕМЕНТЫ КЛАССА !!!
        this.audioTrack = $('#track-audio')[0];
        this.audioRadio = $('#radio-audio')[0];

        // Устанавливаем начальную громкость для обоих объектов
        if (this.audioTrack) this.audioTrack.volume = this.currentVolume;
        if (this.audioRadio) this.audioRadio.volume = this.currentVolume;

        if (this.audioTrack) this.audioTrack.muted = this.isMuted;
        if (this.audioRadio) this.audioRadio.muted = this.isMuted;

        this._initAudioPlayer();
        this._initRadioPlayer();

        // Инициализация плеера
        this.playerTemplate = $('#player-template').html();
        this.playerElement = $(this.playerTemplate);

        let playerElement = $('.player-container.now-playing');
        if (playerElement.length === 0) {
            // Если в DOM не найден, создаем из шаблона (как резерв)
            playerElement = $(this.playerTemplate);
        }

        this.playerElement = null;

        if (this.isCompactMode) {
            playerElement.addClass('compact-player');
            this._setupCompactControls(true);
        }

        this._updateToggleIcons();

        this.orderMode = 'normal';
        this.currentPlaylist = null;
        this.playlisttoggle = playlisttoggle;

        this.likeCallback = typeof onLike === 'function' ? onLike : () => {};
        this.favCallback = typeof onFav === 'function' ? onFav : () => {};
        this.shareCallback = typeof onShare === 'function' ? onShare : () => {};
        this.trackInfoCallback = typeof onTrackInfo === 'function' ? onTrackInfo : () => {};
        this.onDeleteCallback = typeof onDelete === 'function' ? onDelete : () => {};//onRemoveTrackFromAirCallback
        this.onRemoveTrackFromAirCallback = typeof onRemoveTrackFromAir === 'function' ? onRemoveTrackFromAir : () => {};

        this.menu = {
            radio: null,
            info: null,
            share: this.openShareModal.bind(this),
            addToPlaylist: null,
            support: this.bindSupportModalEvents(),
            assignToRadio: this.openAssignRadioModal.bind(this)
        };


        // управление произведением
        this.repeatMode = 'repeat-off';
        this.shuffleMode = 'shuffle-off'; // По умолчанию: по порядку (прямая)

        this.$repeatButton = null;
        this.$shuffleButton = null;

        this.repeatModes = ['repeat-off', 'repeat-all', 'repeat-one'];
        this.shuffleModes = ['shuffle-off', 'shuffle-on', 'shuffle-reverse'];

        this._updatePlayerModeUI();

        this.modeIcons = {

            'repeat-off': 'fas fa-repeat',
            'repeat-all': 'fas fa-repeat',
            'repeat-one': 'fas fa-repeat',

            'shuffle-off': 'fas fa-random',
            'shuffle-on': 'fas fa-shuffle',
            'shuffle-reverse': 'fas fa-sort-numeric-down-alt'
        };


        this.playbackRates = [0.5, 1.0, 1.2, 1.5, 1.7, 2.0, 4.0];

        this.$playbackSpeedButton = null;
        this.$playbackSpeedOptions = null;

        // shuffle playlist
        this.shufflePlaylist = [];
        this.shuffleIndex = 0;
        this.GLOBAL_SHUFFLE_KEY = 'global-shuffle-pool-invisible';

        this.controllersOff();

        // загрузка настроек из localstorage
        this.loadSettings();

        this._initTrackContextMenu();

        this._isProgrammaticUpdate = false;

        this._restoreState();

        this.OFFCANVAS_SELECTOR = '#playlistOffcanvas';
        this.OFFCANVAS_BODY_SELECTOR = '#playlistOffcanvas .offcanvas-body';
        this.OFFCANVAS_LIST_SELECTOR = '#playlist-offcanvas-list';


        this.offcanvasVisibleCount = 0;
        this.offcanvasTracksStep = 10;
        this.offcanvasCurrentPlaylistKey = null;

        this.offcanvasStartIndex = 0;
        this.offcanvasEndIndex = 0;

        this._setupOffcanvasScrollListener();

        window.addEventListener('beforeunload', this._handleBeforeUnload.bind(this));
    }

    _getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    // Внутри класса Player
    _initAudioPlayer() {
        if (this.audioTrack) {
            this.audioTrack.preload = 'auto';

            // !!! КОСЯК ИСПРАВЛЕН: Удалены сбросы громкости, которая читается из localStorage в constructor !!!
            // this.audioTrack.volume = 1;
            // this.audioTrack.muted = true;

            this.audioTrack.playbackRate = 1.0;

            this.audioTrack.addEventListener('play', () => this._onPlayUI());
            this.audioTrack.addEventListener('pause', () => this._onPauseUI());
            this.audioTrack.addEventListener('ended', () => this._onTrackEnd());

            // Единый обработчик ошибок
            this.audioTrack.addEventListener('error', (e) => {
                if (this.isRestoringPlayback) {
                    console.warn('Audio error ignored during playback restoration.');
                    return;
                }

                console.error('AudioTrack error, trying to recover...', e.target.error.code);


                const currentTime = this.audioTrack.currentTime;
                //const src = this.audioTrack.src;

                //this.audioTrack.src = src.split('?')[0] + '?n=1';
                this.audioTrack.load();

                this.audioTrack.addEventListener('loadedmetadata', () => {
                    try {
                        this.audioTrack.currentTime = currentTime;
                        this.audioTrack.play().catch(e => {
                            if (e.name === 'AbortError') {
                                console.warn('Play request aborted, a new one is likely in progress. This is normal behavior.');
                                return;
                            }
                            console.error('Failed to restore position:', e);
                        });
                    } catch (e) {
                        console.error('Failed to restore position:', e);
                    }
                }, { once: true });
            });

            // !!! КОСЯК ИСПРАВЛЕН: Правильная привязка метода _handleStalled !!!
            this.audioTrack.addEventListener('stalled', this._handleStalled.bind(this));

            // Привязка timeupdate
            this.audioTrack.addEventListener('timeupdate', this._handleTimeUpdate.bind(this));

            this.audioTrack.addEventListener('canplay', () => {
                if (this.playerElement) {
                    this.playerElement.removeClass('controls-loading');
                }

                if (this.isPlaying) {
                    this.audioTrack.play().catch(e => {
                        if (e.name === 'AbortError') {
                            console.warn('Play request aborted, a new one is likely in progress.');
                            return;
                        }
                        console.error('Не удалось восстановить позицию:', e);
                        this.errorMessageElement.textContent = `Ошибка воспроизведения: ${e.message || 'Неизвестная ошибка'}`;
                        this.errorMessageElement.style.display = 'block';
                    });
                }
            });
        }
    }

    _loadListeningState() {
        const today = this._getTodayDate();
        try {
            const savedStateJSON = localStorage.getItem(this.listeningStateKey);
            let savedState = savedStateJSON ? JSON.parse(savedStateJSON) : {};

            // Проверяем, совпадает ли дата в первом попавшемся элементе (если карта не пуста)
            // Если дата не совпадает с сегодняшней, сбрасываем всю карту.
            const firstEntryUid = Object.keys(savedState)[0];
            if (firstEntryUid && savedState[firstEntryUid].d !== today) {
                console.log("Ежедневный сброс счетчиков прослушивания.");
                return {}; // Сброс
            }

            return savedState;

        } catch (e) {
            console.error("Ошибка загрузки состояния прослушивания из localStorage", e);
            return {};
        }
    }

    /** Сохраняет карту отправленных событий в localStorage */
    _saveListeningState() {
        try {
            localStorage.setItem(this.listeningStateKey, JSON.stringify(this.listeningEventsSentMap));
        } catch (e) {
            console.error("Ошибка сохранения состояния прослушивания в localStorage", e);
        }
    }


    _saveState() {
        const currentTrackData = this._getCurrentTrackData();

        if (!currentTrackData || this.mode !== 'track') {
            localStorage.removeItem(this.STATE_KEY);
            return;
        }

        // 1. ПРОВЕРКА АКТИВНОСТИ ПРЯМО В HTML-ЭЛЕМЕНТЕ
        // Если аудио не на паузе И имеет ненулевое время (т.е. что-то загружено и проигрывается)
        const isAudioPlaying = !this.audioTrack.paused &&
            this.audioTrack.currentTime > 0;

        if (!isAudioPlaying) {
            // Трек не играет или только что был остановлен.
            console.log("Состояние плеера не сохранено: Аудиотрек не активен.");
            localStorage.removeItem(this.STATE_KEY);
            return;
        }

        // 2. СОХРАНЕНИЕ АКТИВНОГО СОСТОЯНИЯ
        const state = {
            container: currentTrackData.container,
            index: currentTrackData.index,
            data: currentTrackData.data,
            currentTime: this.audioTrack.currentTime, // <-- Берем точное текущее время
            volume: this.currentVolume,
            isMuted: this.isMuted,
            repeatMode: this.repeatMode,
            playbackRate: this.playbackRate
        };

        try {
            localStorage.setItem(this.STATE_KEY, JSON.stringify(state));
            console.log("Состояние плеера сохранено:", currentTrackData.data.title, "на позиции:", state.currentTime.toFixed(2));
        } catch (e) {
            console.error("Ошибка сохранения состояния плеера в localStorage", e);
        }
    }

    _handleBeforeUnload() {
        this._saveState();
    }


    // Внутри класса Player
    _activateTrackInAllPlaylists() {
        // 1. ИСПОЛЬЗУЕМ this.currentTrack как единственный источник истины
        const playingTrackData = this.currentTrack;

        if (!playingTrackData || !this.isPlaying || this.mode !== 'track') {
            // Если плеер не играет, но есть активные элементы, мы должны их сбросить
            // Это может помочь с одиночными треками, которые ошибочно получают active класс
            $(`.${this.trackClass}`).removeClass('active');
            $(`.${this.trackClass}`).find('.play-overlay .audio-wave').addClass('d-none');
            $(`.${this.trackClass}`).find('.play-overlay i.fa-play').removeClass('d-none');
            return;
        }

        const playingUid = playingTrackData.uid;
        const trackClass = this.trackClass;


        // Проходим по всем плейлистам, которые были созданы
        for (const containerSelector in this.playlists) {
            const pl = this.playlists[containerSelector];

            // 2. Находим правильный индекс играющего трека в списке по UID
            const foundIndex = pl.list.findIndex(item => item.data.uid === playingUid);

            if (foundIndex !== -1) {

                // Получаем ВСЕ элементы треков в этом контейнере
                const $allTracks = $(`${containerSelector} .${trackClass}`);

                // 3. Сброс UI в этом плейлисте (гарантируем, что индекс 0 не активен)
                $allTracks.removeClass('active');
                $allTracks.find('.play-overlay .audio-wave').addClass('d-none');
                $allTracks.find('.play-overlay i.fa-play').removeClass('d-none');


                // 4. Получаем и активируем правильный элемент DOM по НАЙДЕННОМУ индексу
                const $activeTrackElement = $allTracks.eq(foundIndex);

                if ($activeTrackElement.length > 0) {

                    // Устанавливаем правильный текущий плейлист и индекс
                    pl.currentIndex = foundIndex;
                    this.currentPlaylist = containerSelector;

                    // Логика активации UI
                    $activeTrackElement.addClass('active');
                    $activeTrackElement.find('.play-overlay .audio-wave').removeClass('d-none');
                    $activeTrackElement.find('.play-overlay i.fa-play').addClass('d-none');

                    console.log(`UI: Трек ${playingUid} (${playingTrackData.title}) активирован в плейлисте ${containerSelector} на ПРАВИЛЬНОМ индексе ${foundIndex}.`);
                }
            } else {
                // Трек не найден в этом плейлисте
                pl.currentIndex = -1;
            }
        }

        const $allTracks = $(`.${trackClass}`);

        // Сбрасываем все, что не является частью плейлиста или является неправильным
        $allTracks.each((index, el) => {
            const $el = $(el);
            const uid = $el.attr('data-uid');

            // Если элемент активен, но его UID не совпадает с играющим, деактивируем
            if ($el.hasClass('active') && uid !== playingUid) {
                $el.removeClass('active');
                $el.find('.play-overlay .audio-wave').addClass('d-none');
                $el.find('.play-overlay i.fa-play').removeClass('d-none');
            }
        });
    }

    _clearState() {
        localStorage.removeItem(this.STATE_KEY);
        this.restoredState = null;
        this.isRestoringPlayback = false;
        this.isPlaying = false;
        this.currentTrack = null; // Очищаем внутреннее состояние
        // Обязательно очищаем аудио-элемент
        this.audioTrack.src = '';
        this.audioTrack.load();
    }

    _restoreState() {
        const savedStateJSON = localStorage.getItem(this.STATE_KEY);

        if (!savedStateJSON) {
            return;
        }

        const state = JSON.parse(savedStateJSON);
        this.restoredState = state;
        const trackData = state.data;

        if (!trackData || !trackData.uid) {
            return;
        }

        // 1. Устанавливаем текущий трек и флаг восстановления
        this.isRestoringPlayback = true;
        this.currentPlaylist = state.container;
        this.currentTrack = trackData;

        this.listeningEventSentForCurrentTrack = false;

        // =====================================================================
        // !!! КРИТИЧЕСКОЕ ДОБАВЛЕНИЕ: ВОССТАНОВЛЕНИЕ ФЛАГА ПРОСЛУШИВАНИЯ !!!
        // =====================================================================
        const restoredUid = trackData.uid;
        // Используем UID восстановленного трека, чтобы проверить персистентную карту.
        this.listeningEventSentForCurrentTrack = !!this.listeningEventsSentMap[restoredUid];

        console.log(`[RESTORE] Восстановлен трек: ${trackData.title}. Listening event previously sent: ${this.listeningEventSentForCurrentTrack}`);
        // =====================================================================

        // Сброс счетчиков, чтобы начать чистое прослушивание с момента восстановления
        this.pureListeningTime = 0;
        this.lastUpdateTime = 0;

        // Устанавливаем источник и позицию
        this.audioTrack.src = `/track/${trackData.uid}`;
        this.audioTrack.currentTime = state.currentTime;

        this.show();
        const restoredTimecode = this._toTimecode(state.currentTime);

        // Вызываем showCover.
        this.showCover({ ...trackData, currentState: restoredTimecode }, 205);

        // [ДОБАВЛЕНО] Активируем текущий трек сразу после showCover, чтобы он подсветился в Offcanvas/плейлисте
        this._activateTrackInAllPlaylists();

        // =====================================================================
        // !!! КРИТИЧЕСКИЙ ФИКС ШАФЛА ПРИ ВОССТАНОВЛЕНИИ СОСТОЯНИЯ !!!
        // =====================================================================
        const isShuffleMode = this.shuffleMode === 'shuffle-on';
        const isGlobalShufflePlaylist = this.currentPlaylist === this.GLOBAL_SHUFFLE_KEY;

        console.log(`[RESTORE_DEBUG] Проверка шафла: Режим (current): ${isShuffleMode ? 'вкл' : 'выкл'}, Плейлист: ${isGlobalShufflePlaylist ? 'глобальный' : 'другой'}`);

        let shuffleWasFixed = false;

        if (isShuffleMode && isGlobalShufflePlaylist) {
            const globalPl = this.playlists[this.GLOBAL_SHUFFLE_KEY];

            if (globalPl && trackData && globalPl.shuffledList && globalPl.list && globalPl.list.length > 0) {
                // 1. Находим оригинальный индекс текущего трека в полном списке
                const originalIndex = globalPl.list.findIndex(item => item.data.uid === trackData.uid);

                if (originalIndex !== -1) {
                    // 2. Находим позицию этого индекса в перемешанном списке
                    const newShuffledIndex = globalPl.shuffledList.indexOf(originalIndex);

                    if (newShuffledIndex !== -1) {
                        // 3. Синхронизируем порядок
                        if (newShuffledIndex > 0) {
                            // Перемещаем его на позицию 0
                            globalPl.shuffledList.splice(newShuffledIndex, 1);
                            globalPl.shuffledList.unshift(originalIndex);
                            console.log(`[RESTORE_SHUFFLE_FIX] Трек (${trackData.title}) перемещен на позицию 0.`);
                        } else {
                            console.log(`[RESTORE_SHUFFLE_FIX] Трек (${trackData.title}) уже на позиции 0.`);
                        }

                        // 4. Устанавливаем текущий индекс шафла на 0
                        globalPl.shuffledCurrentIndex = 0;
                        shuffleWasFixed = true;

                        // 5. ДОПОЛНИТЕЛЬНОЕ ЛОГИРОВАНИЕ: проверяем, какой трек теперь первый
                        const firstTrackIndex = globalPl.shuffledList[0];
                        const firstTrackInList = globalPl.list[firstTrackIndex].data.title;
                        console.log(`[RESTORE_SHUFFLE_FIX] Плейлист зафиксирован. Новый первый трек в шафле: ${firstTrackInList}`);

                    } else {
                        console.error(`[RESTORE_SHUFFLE_ERROR] Трек найден в globalPl.list, но его индекс (${originalIndex}) не найден в globalPl.shuffledList!`);
                    }
                } else {
                    console.warn(`[RESTORE_SHUFFLE_WARN] Текущий трек не найден в глобальном плейлисте (globalPl.list). UID: ${trackData.uid}`);
                }
            } else {
                console.warn(`[RESTORE_SHUFFLE_WARN] Global playlist, shuffledList или list не готов во время _restoreState.`);
            }
        }

        // Если состояние шафла было синхронизировано (shuffleWasFixed), принудительно перерисовываем Offcanvas.
        if (shuffleWasFixed) {
            try {
                if (typeof this.renderOffcanvasFromPlaylist === 'function') {
                    // !!! КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: ОТКЛАДЫВАЕМ ПЕРЕРИСОВКУ !!!
                    // Это нужно, чтобы внешний код (например, Bootstrap JS для Offcanvas)
                    // успел завершить свою инициализацию.
                    setTimeout(() => {
                        this.renderOffcanvasFromPlaylist(this.OFFCANVAS_LIST_SELECTOR, this.GLOBAL_SHUFFLE_KEY);
                        console.log('[RESTORE_SHUFFLE_FIX] Offcanvas принудительно перерисован (отложенно) после фикса шафла.');
                    }, 50); // Небольшая задержка в 50 мс
                } else {
                    console.warn('[RESTORE_SHUFFLE_WARN] Метод renderOffcanvasFromPlaylist не найден. Невозможно перерисовать Offcanvas.');
                }
            } catch (e) {
                console.error('[RESTORE_SHUFFLE_ERROR] Ошибка при принудительной перерисовке Offcanvas:', e);
            }
        }
        // =====================================================================

        this.audioTrack.play()
            .then(() => {
                const restoredUid = trackData.uid;

                if (!this.currentTrack || this.currentTrack.uid !== restoredUid) {
                    console.warn(`[STATE_CONFLICT] Восстановление: this.currentTrack был перезаписан (${this.currentTrack ? this.currentTrack.title : 'N/A'}) во время play() Трека: ${trackData.title}. Останавливаем воспроизведение, но сохраняем новое состояние.`);

                    const winningTrack = this.currentTrack;

                    // 1. Останавливаем аудио Трека А (неправильный аудио-поток)
                    this.audioTrack.pause();
                    this.audioTrack.src = '';
                    this.audioTrack.load();

                    // 2. Очищаем сохраненное состояние, чтобы избежать этого конфликта в будущем
                    localStorage.removeItem(this.STATE_KEY);

                    // 3. Сохраняем новое, "победившее" состояние (Трек Б) и ставим на паузу
                    this.isPlaying = false; // Трек Б теперь в паузе
                    this.isRestoringPlayback = false;

                    if (winningTrack) {
                        const restoredTimecode = this._toTimecode(this.audioTrack.currentTime); // Используем текущее время (должно быть 0)

                        // Обновляем обложку и кнопки плеера (в режиме паузы)
                        this.showCover({ ...winningTrack, currentState: restoredTimecode }, 205);
                        this._activateTrackInAllPlaylists(); // Активируем кнопку Play/Pause
                        this._onPauseUI(); // Убеждаемся, что UI в режиме паузы
                    }

                    // this.currentTrack уже содержит Трек Б (перезаписан внешним скриптом)
                    return;
                }
                this.isPlaying = true;
                this.isRestoringPlayback = false; // <-- СБРОС ФЛАГА

                this._onPlayUI();
                this._activateTrackInAllPlaylists();

                console.log('Восстановление завершено. Трек:', this.currentTrack.title);

                // !!! КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: ЯВНО ВЫЗЫВАЕМ ЗАПРОС СЕРВЕРА !!!
                // Отложенный вызов, чтобы дать время внешнему JS установить player.onTrackInfo
                setTimeout(() => {
                    if (this.currentTrack && this.currentTrack.uid) {
                        console.log('Отложенный запрос данных трека с сервера:', this.currentTrack.uid);
                        // Это запустит AJAX-запрос, который обновит this.currentTrack и вызовет showCover повторно
                        this._loadTrackExtraInfo(this.currentTrack.uid);
                    }
                }, 100);

            })
            .catch(err => {
                // Обработка ошибки play()
                if (err.name === 'NotAllowedError' || err.name === 'NotSupportedError' || err.name === 'SecurityError') {
                    console.warn(`Восстановление: Ошибка автоматического воспроизведения (${err.name}). Пользователь должен инициировать Play.`);
                } else {
                    console.error('Ошибка воспроизведения при восстановлении:', err.name, err.message);
                }
                this.isPlaying = false;
                this.isRestoringPlayback = false;
                this._clearState();
            });
    }

    _syncPlayerUIWithTrack(trackData, currentTime = 0) {
        if (!this.playerElement || this.playerElement.length === 0) {
            return;
        }

        // 1. Обновление названия трека и артиста
        this.playerElement.find('.track-title').text(trackData.title || 'Неизвестный трек');
        this.playerElement.find('.track-artist').text(trackData.artist || 'Неизвестный артист');

        // 2. Обновление обложки плеера и фона
        // Предполагается, что showCover обновляет обложку на самом плеере
        this.showCover(trackData, 200);
        // Предполагается, что у вас есть этот код для фона
        $('.bg-blur').css('background-image', `url(/cover/${trackData.uid}?width=360&ts=${Date.now()})`);

        // 3. Обновление временных меток и прогресса

        // Определяем общую продолжительность (при восстановлении может быть доступна только через audioTrack)
        const duration = this.audioTrack.duration && !isNaN(this.audioTrack.duration) && isFinite(this.audioTrack.duration)
            ? this.audioTrack.duration
            : trackData.duration || 1; // Защита на случай, если метаданные еще не загружены

        // Обновляем общее время
        const durationTimecode = this._toTimecode(duration, 3);
        this.playerElement.find('.duration-time').text(durationTimecode);

        // Обновляем текущее время
        const currentTimecode = this._toTimecode(currentTime, 3);
        this.playerElement.find('.current-time').text(currentTimecode);

        // Обновляем прогресс бар
        const progressPercent = (currentTime / duration) * 100;
        this.playerElement.find('.audio-progress-bar').val(progressPercent);
        this.playerElement.find('.audio-progress-bar').css('background-size', `${progressPercent}% 100%`);

        // 4. Обновление иконок Play/Pause и режимов (Repeat/Shuffle)
        this._updateToggleIcons();
        this._updatePlayerModeUI();

        // 5. [ДОБАВЛЕНО] Убеждаемся, что текущий трек подсвечен в плейлисте (в т.ч. Offcanvas)
        this._activateTrackInAllPlaylists();
    }


    // Внутри класса Player
    _handleTimeUpdate() {
        // 1. Получаем активный элемент и проверяем наличие данных
        const activeAudio = this._getActiveAudioElement();
        if (!activeAudio || !this.currentTrack) return;

        // =========================================================================
        // !!! 🛑 КРИТИЧЕСКАЯ БЛОКИРОВКА ПРИ ВОССТАНОВЛЕНИИ !!!
        // Если идет восстановление состояния после перезагрузки, мы НЕ считаем это
        // новым прослушиванием и выходим. isRestoringPlayback должен быть установлен
        // в _restoreState() и сброшен при первом действии пользователя.
        // =========================================================================
        if (this.isRestoringPlayback) {
            return;
        }

        const now = activeAudio.currentTime;

        // =========================================================================
        // 2. Расчет Pure Listening Time (Время без перемотки/пауз)
        // =========================================================================

        const timeDelta = now - this.lastUpdateTime;

        // Защита от скачков времени
        if (this.lastUpdateTime > 0 && timeDelta > 0 && timeDelta < 5) {
            if (!activeAudio.paused && !activeAudio.seeking) {
                this.pureListeningTime += timeDelta;
            }
        }
        this.lastUpdateTime = now;

        // =========================================================================
        // 3. Отправка события track_listening с логикой циклического счетчика (3+1)
        // =========================================================================

        const trackUid = this.currentTrack.uid;
        const listenLimit = this.listenLimit; // 3
        const today = this._getTodayDate();

        let trackListeningState = this.listeningEventsSentMap[trackUid];

        if (!trackListeningState) {
            trackListeningState = { c: 0, d: today };
            this.listeningEventsSentMap[trackUid] = trackListeningState;
        }

        // Проверка даты и сброс
        if (trackListeningState.d !== today) {
            trackListeningState.c = 0;
            trackListeningState.d = today;
        }

        // --- КРИТИЧЕСКОЕ УСЛОВИЕ ОБРАБОТКИ СЕАНСА ---
        if (!activeAudio.muted &&
            this.pureListeningTime >= this.timeListening &&
            !this.listeningEventSentForCurrentTrack
        ) {

            const currentCount = trackListeningState.c;
            let shouldSendEvent = false;
            let isLimitReachedAndReset = false; // Новый флаг для удаления

            // --- ЛОГИКА ЦИКЛА ПРОСЛУШИВАНИЯ (1 -> 2 -> 3 -> УДАЛЕНИЕ/НОВАЯ ЗАПИСЬ) ---

            if (currentCount === 0) {
                // 1. Первое прослушивание (0 -> 1): отправляем событие
                shouldSendEvent = true;
                trackListeningState.c = 1;
            } else if (currentCount < listenLimit) {
                // 2. Второе/Третье прослушивание (1 -> 2 или 2 -> 3): только инкремент
                shouldSendEvent = false;
                trackListeningState.c = currentCount + 1;
            } else { // currentCount === listenLimit (Третий раз прослушан, настало 4-е)
                // 3. Четвертое прослушивание: ОТПРАВЛЯЕМ новое событие и УДАЛЯЕМ запись
                shouldSendEvent = true;
                isLimitReachedAndReset = true; // Указываем, что запись должна быть удалена
                console.log(`[CYCLE_RESET] Достигнут лимит (${listenLimit}). Удаляем запись из массива/localStorage и отправляем новую (4-е прослушивание).`);
            }

            // 1. Устанавливаем локальный флаг сеанса
            this.listeningEventSentForCurrentTrack = true;

            // 2. Отправляем событие, если это начало цикла (1-е или 4-е)
            if (shouldSendEvent) {
                const listeningTimecode = this._toTimecode(this.pureListeningTime);
                const trackData = {
                    ...this.currentTrack,
                    duration_played: listeningTimecode,
                    source: this.mode
                };
                this._sendEventToServer("track_listening", trackData);
            }

            // 3. Обновляем или УДАЛЯЕМ персистентный счетчик
            if (isLimitReachedAndReset) {
                delete this.listeningEventsSentMap[trackUid];
                console.log(`Entry deleted for ${this.currentTrack.title}. Next playback will start a new cycle.`);
            } else {
                // Обновляем дату, даже если событие не отправлялось (для 2-го и 3-го раза)
                trackListeningState.d = today;
                this.listeningEventsSentMap[trackUid] = trackListeningState;
                console.log(`${shouldSendEvent ? 'Event sent' : 'Counter updated'} for ${this.currentTrack.title}. New count: ${trackListeningState.c || 0}/${listenLimit}`);
            }

            // 4. Сохраняем персистентную карту в localStorage
            this._saveListeningState();
        }

        // =========================================================================
        // 4. Обновление UI
        // =========================================================================

        const percent = (now / activeAudio.duration) * 100;
        const timecode = this._toTimecode(now, 3);

        // Обновляем метаданные трека в this.currentTrack
        this.currentTrack.duration_played = timecode;

        // Обновляем UI (прогресс-бар и время)
        if (this.playerElement) {
            this.playerElement.find('.progress-bar-container .progress-bar').css('width', `${percent}%`);
            this.playerElement.find('.duration-from').text(timecode);
            this.playerElement.find('.now-playing').attr('data-duration_played', timecode);
            this.playerElement.find('.now-playing .elapsed-time').text(timecode);
        }

        // Обновление DOM для элемента в плейлисте:
        if (this.currentPlaylist && this.playlists[this.currentPlaylist] && this.playlists[this.currentPlaylist].currentIndex !== undefined) {
            const index = this.playlists[this.currentPlaylist].currentIndex;
            const $track = $(`${this.currentPlaylist} .${this.trackClass}`).eq(index);
            $track.find('.progress-bar-container .progress-bar').css('width', `${percent}%`);
            $track.find('.duration-from').text(timecode);
            $track.attr('data-duration_played', timecode);
        }
    }

    _handleStalled() {
        // Убеждаемся, что мы в режиме трека и ожидаем воспроизведения
        if (this.mode !== 'track' || !this.isPlaying) return;

        if (this.isRestoringPlayback) {
            console.warn('Stalled event ignored during playback restoration.');
            return;
        }

        // Если плеер уже находится в процессе восстановления или достиг лимита
        if (this.isAttemptingRecovery) {
            return;
        }

        if (this.stalledRecoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
            // Достигнуто максимальное количество попыток
            console.error('Автовосстановление трека не удалось после ' + this.MAX_RECOVERY_ATTEMPTS + ' попыток. Остановка.');
            this._onPauseUI();
            return;
        }

        // =========================================================================================
        // УДАЛЕНА ЛОГИКА ФИКСА ШАФЛА. Она должна выполняться только в _restoreState() при загрузке.
        // =========================================================================================

        this.isAttemptingRecovery = true;
        this.stalledRecoveryAttempts++;
        console.warn(`AudioTrack stalled. Попытка восстановления #${this.stalledRecoveryAttempts}...`);

        // 1. Пытаемся перезагрузить метаданные (мягкий перезапуск)
        this.audioTrack.load();

        // 2. Даем браузеру время, затем пытаемся продолжить воспроизведение
        setTimeout(() => {
            if (this.isPlaying) {
                this.audioTrack.play()
                    .then(() => {
                        console.log('Восстановление успешно завершено.');
                        this.stalledRecoveryAttempts = 0; // Сброс счетчика при успехе
                        this.isAttemptingRecovery = false;

                        // Обновляем Offcanvas, если мы в режиме шафла и он открыт
                        if (this.shuffleMode === 'shuffle-on' &&
                            this.currentPlaylist === this.GLOBAL_SHUFFLE_KEY &&
                            $(this.OFFCANVAS_SELECTOR).hasClass('show') &&
                            this.offcanvasCurrentPlaylistKey === this.GLOBAL_SHUFFLE_KEY) {

                            // Предполагаем, что renderOffcanvasFromPlaylist доступен для перерисовки
                            if (typeof this.renderOffcanvasFromPlaylist === 'function') {
                                this.renderOffcanvasFromPlaylist(this.OFFCANVAS_LIST_SELECTOR, this.GLOBAL_SHUFFLE_KEY);
                                console.log('[STALLED_SHUFFLE_FIX] Offcanvas перерисован после успешного восстановления.');
                            }
                        }
                    })
                    .catch(err => {
                        this.isAttemptingRecovery = false;
                        // AbortError не является ошибкой, если происходит новый load/play/pause
                        if (err.name === 'AbortError') {
                            console.log('Play() после stalled прервано новым запросом (AbortError).');
                        } else {
                            console.error('Ошибка при попытке play() после stalled:', err.name, err.message);
                        }
                    });
            } else {
                this.isAttemptingRecovery = false;
            }
        }, 1000); // Задержка в 1 секунду для загрузки данных
    }

    _initRadioPlayer() {
        this.audioRadio.src = this.stream;
        this.audioRadio.preload = 'none';
        this.audioRadio.autoplay = false;
        this.audioRadio.volume = 1;
        this.audioRadio.muted = false;
        this.audioRadio.load();

        if (this.mode === 'radio' && this.playlisttoggle) {
            this.audioRadio.load();
        }

        this.audioRadio.addEventListener('error', () => {
            if (this.mode !== 'radio') return;
            console.warn('Radio error, reconnecting...');
            this.audioRadio.src = this.stream + '?n=2';
            this.audioRadio.play().catch(()=>{});
        });

        /*this.audioRadio.addEventListener('stalled', () => {
			if (this.mode !== 'radio') return;
			console.warn('Radio stalled, reconnecting...');
			this.audioRadio.src = this.stream + '?t=' + Date.now();
			this.audioRadio.play().catch(()=>{});
		});*/

        this.audioRadio.addEventListener('stalled', () => {
            console.warn('AudioTrack stalled, reconnecting...');
            //this.audioTrack.load();
            //this.restartCurrentTrack();
            if (this.mode !== 'radio') return;
            this._handleStalled.bind(this)
        });

        this.audioRadio.addEventListener('timeupdate', this._handleTimeUpdate.bind(this));
    }


    getCurrentlyPlayingContent() {
        if (this.mode === 'radio' && this.currentStreamData) {
            return {
                type: 'radio',
                data: this.currentStreamData
            };
        }

        const currentTrackData = this._getCurrentTrackData();
        if (currentTrackData && currentTrackData.data) {
            return {
                type: 'track',
                data: currentTrackData.data
            };
        }

        return null;
    }

    _areFloatsApproximatelyEqual(a, b, epsilon = 0.001) {
        return Math.abs(a - b) < epsilon;
    }

    loadSettings() {
        const savedRepeatMode = localStorage.getItem('playerRepeatMode');
        const savedShuffleMode = localStorage.getItem('playerShuffleMode');
        const savedPlaybackRate = localStorage.getItem('playerPlaybackRate');

        if (savedRepeatMode && this.repeatModes.includes(savedRepeatMode)) {
            this.repeatMode = savedRepeatMode;
            console.log('Loaded Repeat Mode:', this.repeatMode);
        } else {
            this.repeatMode = 'repeat-off';
        }

        if (savedShuffleMode && this.shuffleModes.includes(savedShuffleMode)) {
            this.shuffleMode = savedShuffleMode;
            console.log('Loaded Shuffle Mode:', this.shuffleMode);
        } else {
            this.shuffleMode = 'shuffle-off';
        }

        if (savedPlaybackRate) {
            const parsedRate = parseFloat(savedPlaybackRate);
            let isValidRate = false;

            // Проверяем, что загруженное значение является числом и приблизительно совпадает с одним из разрешенных
            if (!isNaN(parsedRate)) {
                for (let i = 0; i < this.playbackRates.length; i++) {
                    if (this._areFloatsApproximatelyEqual(parsedRate, this.playbackRates[i])) {
                        isValidRate = true;
                        break;
                    }
                }
            }

            if (isValidRate) {
                this.playbackRate = parsedRate;
                this.audioTrack.playbackRate = parsedRate; // Применяем загруженную скорость к audioTrack
                console.log('Loaded Playback Rate:', this.playbackRate);
            } else {
                this.playbackRate = 1.0; // По умолчанию
                this.audioTrack.playbackRate = 1.0;
            }
        } else {
            this.playbackRate = 1.0; // По умолчанию
            this.audioTrack.playbackRate = 1.0;
        }
    }

    saveSettings() {
        localStorage.setItem('playerRepeatMode', this.repeatMode);
        localStorage.setItem('playerShuffleMode', this.shuffleMode);
        localStorage.setItem('playerPlaybackRate', this.playbackRate.toString()); // Сохраняем как строку
        console.log('Settings saved to localStorage.');
    }

    _updatePlayerModeUI() {
        const $player = this.playerElement;
        const _this = this;

        if (this.$repeatButton) {
            this.$repeatButton.attr('data-mode', this.repeatMode);
            // Обновляем иконку повтора
            const repeatIconClass = this.modeIcons[this.repeatMode];
            if (repeatIconClass) {
                this.$repeatButton.find('i').attr('class', repeatIconClass);
            }

            // Обновляем tooltip для repeat
            let repeatTooltipText = 'Повторить';
            if (this.repeatMode === 'repeat-all') {
                repeatTooltipText = 'Повтор плейлиста';
            } else if (this.repeatMode === 'repeat-one') {
                repeatTooltipText = 'Повторить один трек';
            }

            /*$player.find('[data-action="repeat"]').attr('title', repeatTooltipText).attr('data-bs-original-title', repeatTooltipText)
				.tooltip('dispose')
				.tooltip();*/
        }

        if (this.$shuffleButton) {
            this.$shuffleButton.attr('data-mode', this.shuffleMode);
            // Обновляем иконку перемешивания
            const shuffleIconClass = this.modeIcons[this.shuffleMode];
            if (shuffleIconClass) {
                this.$shuffleButton.find('i').attr('class', shuffleIconClass);
            }
            // Обновляем tooltip для shuffle
            let shuffleTooltipText = 'По порядку';

            if (this.shuffleMode === 'shuffle-on') {
                shuffleTooltipText = 'Перемешать плейлист';
            } else if (this.shuffleMode === 'shuffle-reverse') {
                shuffleTooltipText = 'Порядок обратный';
            }

            /*$player.find('[data-action="shuffle"]').attr('title', shuffleTooltipText).attr('data-bs-original-title', shuffleTooltipText)
				.tooltip('dispose')
				.tooltip(); */
        }

        if (this.$playbackSpeedToggle && this.$playbackSpeedToggle.length > 0) {
            const currentSpeedText = `${this._getDisplayPlaybackRate(this.playbackRate)}x`;

            // Обновляем атрибуты title для тултипа
            this.$playbackSpeedToggle.attr('title', currentSpeedText);
            this.$playbackSpeedToggle.attr('data-bs-original-title', currentSpeedText);

            // Обновляем текстовое содержимое <i> элемента внутри кнопки
            this.$playbackSpeedToggle.find('.playback-speed-text').text(currentSpeedText);

            // Распоряжаемся тултипом и переинициализируем его
            /*setTimeout(() => {
				if (this.$playbackSpeedToggle.data('bs.tooltip')) {
					this.$playbackSpeedToggle.tooltip('dispose');
				}
				this.$playbackSpeedToggle.tooltip();
			}, 0);*/
        }

        /*if (this.$audioSettingsToggle && this.$audioSettingsToggle.length > 0) {
			setTimeout(() => {
				if (this.$audioSettingsToggle.data('bs.tooltip')) {
					this.$audioSettingsToggle.tooltip('dispose');
				}
				this.$audioSettingsToggle.tooltip();
			}, 0);
		}*/

        // Обновление стилей для активной кнопки скорости
        if (this.$playbackSpeedOptions && this.$playbackSpeedOptions.length > 0) {
            this.playerElement.find('.playback-speed-option').removeClass('bg-pink'); // Удаляем класс со всех

            this.playerElement.find('.playback-speed-option').each((index, el) => {
                const buttonSpeedHtml = parseFloat($(el).data('speed')); // Скорость из HTML: 0.5, 1.0, 1.5, 2.0

                // Простое сравнение, так как this.playbackRate теперь будет 1.0 или 2.0
                // Используем небольшую погрешность для сравнения чисел с плавающей точкой
                if (Math.abs(this.playbackRate - buttonSpeedHtml) < 0.001) {
                    $(el).addClass('bg-pink');
                }
            });
        }
    }

    // Переключение режима повтора
    toggleRepeatMode() {
        let currentIndex = this.repeatModes.indexOf(this.repeatMode);
        let nextIndex = (currentIndex + 1) % this.repeatModes.length;
        this.setRepeatMode(this.repeatModes[nextIndex]);
    }

    // Установка режима повтора
    setRepeatMode(newMode, updateOther = true) {
        if (!this.repeatModes.includes(newMode)) {
            console.warn(`Неизвестный режим повтора: ${newMode}`);
            return;
        }

        this.repeatMode = newMode;

        if (this.repeatMode !== 'repeate-off' && updateOther) {
            this.setShuffleMode('shuffle-off', false);
        }
        this._updatePlayerModeUI();

        this.saveSettings();
    }

    // Переключение режима перемешивания
    toggleShuffleMode() {
        let currentIndex = this.shuffleModes.indexOf(this.shuffleMode);
        let nextIndex = (currentIndex + 1) % this.shuffleModes.length;
        this.setShuffleMode(this.shuffleModes[nextIndex]);
    }

    // Установка режима перемешивания
    setShuffleMode(newMode, updateOther = true) {
        if (!this.shuffleModes.includes(newMode)) {
            console.warn(`Неизвестный режим перемешивания: ${newMode}`);
            return;
        }

        this.shuffleMode = newMode;
        //console.log('Shuffle Mode:', this.shuffleMode);

        const isShuffleOn = this.shuffleMode === 'shuffle-on';
        const globalPl = this.playlists[this.GLOBAL_SHUFFLE_KEY];

        for (let container in this.playlists) {
            const pl = this.playlists[container];
            if (!pl || !pl.list || pl.list.length === 0) continue;

            if (isShuffleOn) {
                // Генерируем перемешанный список
                pl.shuffledList = this._getShuffledArray(pl.list.map((item, index) => index)); // Храним индексы

                // Если мы только что включили перемешивание, устанавливаем текущий индекс в shuffledList
                if (pl.currentIndex !== undefined && pl.currentIndex !== -1) {
                    pl.shuffledCurrentIndex = pl.shuffledList.indexOf(pl.currentIndex);
                    if (pl.shuffledCurrentIndex === -1) { // Если текущего трека нет в перемешанном списке
                        pl.shuffledCurrentIndex = 0;
                    }
                } else {
                    pl.shuffledCurrentIndex = 0; // Иначе начинаем с первого элемента перемешанного списка
                }
                // console.log(`Плейлист ${container} перемешан. shuffledList:`, pl.shuffledList);
            } else {
                // Сбрасываем перемешанный список
                delete pl.shuffledList;
                delete pl.shuffledCurrentIndex;
                // console.log(`Плейлист ${container} перемешивание выключено.`);
            }
        }

        // Если включаем шафл, принудительно устанавливаем текущий плейлист на глобальный пул
        if (isShuffleOn && globalPl) {
            // Нам нужно убедиться, что currentTrack синхронизирован с глобальным пулом,
            // чтобы nextTrack корректно нашел следующий трек.
            if (this.currentTrack) {
                const currentTrackIndexInGlobal = globalPl.list.findIndex(t => t.data.uid === this.currentTrack.uid);
                if (currentTrackIndexInGlobal !== -1) {
                    globalPl.currentIndex = currentTrackIndexInGlobal;
                }
            }
            this.currentPlaylist = this.GLOBAL_SHUFFLE_KEY;
            console.log(`Режим "shuffle-on" активирован. Текущий плейлист: ${this.GLOBAL_SHUFFLE_KEY}`);
        } else if (!isShuffleOn && this.currentPlaylist === this.GLOBAL_SHUFFLE_KEY) {
            // Если выключаем шафл, возвращаемся к первому видимому плейлисту
            const containers = Object.keys(this.playlists).filter(c => c !== this.GLOBAL_SHUFFLE_KEY);
            const firstVisibleContainer = containers.find(c => this.playlists[c]?.list?.length > 0);
            if (firstVisibleContainer) {
                this.currentPlaylist = firstVisibleContainer;
                console.log(`Режим "shuffle-on" выключен. Возврат к плейлисту: ${this.currentPlaylist}`);
            } else {
                console.warn('Невозможно вернуться к видимому плейлисту. Плеер остановлен.');
                this._onPauseUI();
            }
        }


        // Если включаем перемешивание (не 'shuffle-off'), выключаем повтор
        if (this.shuffleMode !== 'shuffle-off' && updateOther) {
            this.setRepeatMode('repeat-off', false); // Выключаем повтор
        }
        this._updatePlayerModeUI();
        this.saveSettings();
    }


    // Метод для установки скорости воспроизведения
    setPlaybackRate(newRate) {
        if (!this.playbackRates.includes(newRate)) {
            console.warn(`Неизвестная скорость воспроизведения: ${newRate}`);
            return;
        }

        this.audioTrack.playbackRate = newRate;
        this.playbackRate = newRate;
        console.log('Playback Rate set to:', this.playbackRate);

        this._updatePlayerModeUI();

        this.saveSettings();
    }

    _getDisplayPlaybackRate(rate) {
        return rate.toFixed(1);
    }

    _getActiveAudioElement() {
        return this.mode === 'track' ? this.audioTrack : this.audioRadio;
    }

    _updateSettingsUI() {
        // 1. Инициализация UI громкости (иконка, ползунок)
        this._initVolumeUIAndEvents();

        // 2. Обновление UI режимов (скорость, shuffle, repeat)
        this._updatePlayerModeUI();

        // Обновление UI скорости
        if (this.playerElement) {
            // Обновление текста скорости воспроизведения
            this.playerElement.find('.playback-speed-text').text(`${this.audioTrack.playbackRate.toFixed(1)}x`);
            // Обновление иконок скорости (выбор в выпадающем списке)
            this.playerElement.find('.playback-speed-option').removeClass('active');
            this.playerElement.find(`.playback-speed-option[data-speed="${this.audioTrack.playbackRate.toFixed(1)}"]`).addClass('active');
        }
    }

    _initVolumeUIAndEvents() {
        this._updateVolumeIcon(this.currentVolume);
        this.playerElement.find('.volume-slider').val(this.currentVolume);

        // 2. Привязка событий громкости
        this.playerElement.on('input', '.volume-slider', this._handleVolumeSliderChange.bind(this));
        // !!! ЭТОТ СЛУШАТЕЛЬ ДОЛЖЕН БЫТЬ ПРИВЯЗАН !!!
        this.playerElement.on('click', '[data-action="mute-unmute"]', this._toggleMute.bind(this));

        // 3. Закрытие панели громкости при закрытии настроек
        this.playerElement.on('hidden.bs.collapse', '#audioSettingsCollapse', () => {
            this.playerElement.find('#volumeControlCollapse').collapse('hide');
        });
    }

    _updateVolumeIcon(volume) {
        if (!this.playerElement) return; // Защита на случай раннего вызова

        const $volumeToggleIcon = this.playerElement.find('.volume-toggle i');
        const $muteToggleIcon = this.playerElement.find('.volume-mute-toggle i');

        const iconClasses = 'fa-volume-up fa-volume-down fa-volume-off fa-volume-mute';
        $volumeToggleIcon.removeClass(iconClasses);
        $muteToggleIcon.removeClass(iconClasses);

        if (this.isMuted || volume === 0) {
            $volumeToggleIcon.addClass('fa-volume-mute');
            $muteToggleIcon.addClass('fa-volume-mute');
        } else if (volume > 0.5) {
            $volumeToggleIcon.addClass('fa-volume-up');
            $muteToggleIcon.addClass('fa-volume-up');
        } else if (volume > 0) {
            $volumeToggleIcon.addClass('fa-volume-down');
            $muteToggleIcon.addClass('fa-volume-down');
        } else {
            $volumeToggleIcon.addClass('fa-volume-off');
            $muteToggleIcon.addClass('fa-volume-off');
        }
    }


    _handleVolumeSliderChange(e) {
        // КРИТИЧНОЕ ИСПРАВЛЕНИЕ: Игнорируем вызов, если он пришел от _toggleMute
        if (this._isProgrammaticUpdate) {
            return;
        }

        const newVolume = parseFloat($(e.currentTarget).val());
        const wasMuted = this.isMuted || this.currentVolume === 0;
        const isNowMuted = newVolume === 0;

        // 0. Обновляем состояние
        this.currentVolume = newVolume;
        this.isMuted = isNowMuted;

        // 1. Применяем громкость и .muted к аудио-элементам
        if (this.audioTrack) {
            this.audioTrack.volume = newVolume;
            this.audioTrack.muted = isNowMuted;
        }
        if (this.audioRadio) {
            this.audioRadio.volume = newVolume;
            this.audioRadio.muted = isNowMuted;
        }

        // 2. Отправка события volume_toggle (только если Mute/Unmute меняется через ползунок)
        if (isNowMuted !== wasMuted) {
            const $tpl = $('.now-playing');
            if($tpl.attr('data-uid') != undefined) {
                this._sendEventToServer("volume_toggle", {
                    uid: $tpl.attr('data-uid'),
                    title: $tpl.attr('data-title'),
                    artist: $tpl.attr('data-artist'),
                    duration_played: $tpl.attr('data-duration_played') || "00:00:00",
                    duration: $tpl.attr('data-duration') || "00:00:00",
                    source: this.mode
                });
            }
        }

        // 3. Обновление сохраненной громкости и UI
        if (newVolume > 0) {
            this.savedVolume = newVolume;
        }

        localStorage.setItem(this.volumeKey, newVolume.toString());
        this._updateVolumeIcon(newVolume);
    }


    _toggleMute() {
        this.isMuted = !this.isMuted;

        const isMutedFlag = this.isMuted; // Новое состояние

        if (isMutedFlag) {
            // Mute: сохраняем текущую громкость и устанавливаем 0
            if (this.currentVolume > 0) {
                this.savedVolume = this.currentVolume;
            }
            this.currentVolume = 0;
        } else {
            // Unmute: восстанавливаем сохраненную громкость
            const restoreVolume = this.savedVolume > 0 ? this.savedVolume : this.defaultVolume;
            this.currentVolume = restoreVolume;
        }

        // 1. Установка .muted и volume на аудио-элементах
        if (this.audioTrack) this.audioTrack.muted = isMutedFlag;
        if (this.audioRadio) this.audioRadio.muted = isMutedFlag;
        if (this.audioTrack) this.audioTrack.volume = this.currentVolume;
        if (this.audioRadio) this.audioRadio.volume = this.currentVolume;

        // 2. КРИТИЧНО: Устанавливаем флаг, чтобы _handleVolumeSliderChange проигнорировал вызов
        this._isProgrammaticUpdate = true;

        // 3. Обновляем ползунок (этот вызов инициирует нежелательный каскад 'input')
        if (this.playerElement) {
            this.playerElement.find('.volume-slider').val(this.currentVolume);
        }

        // 4. Отправляем событие (Оно должно отправляться ТОЛЬКО отсюда при нажатии кнопки)
        const $tpl = $('.now-playing');
        if($tpl.attr('data-uid') != undefined) {
            this._sendEventToServer("volume_toggle", {
                uid: $tpl.attr('data-uid'),
                title: $tpl.attr('data-title'),
                artist: $tpl.attr('data-artist'),
                duration_played: $tpl.attr('data-duration_played') || "00:00:00",
                duration: $tpl.attr('data-duration') || "00:00:00",
                source: this.mode
            });
        }

        // 5. Обновляем UI и хранилище, и СБРАСЫВАЕМ ФЛАГ.
        if (this.playerElement) {
            this._updateVolumeIcon(this.currentVolume);
        }
        localStorage.setItem(this.volumeKey, this.currentVolume.toString());
        this._isProgrammaticUpdate = false; // Сбрасываем флаг сразу после синхронных операций
    }

    // Внутри класса Player
    soundOff(muted) {
        // Устанавливаем флаг .muted на обоих элементах
        if (this.audioTrack) this.audioTrack.muted = muted;
        if (this.audioRadio) this.audioRadio.muted = muted;
        this.isMuted = muted; // Обновляем внутренний флаг

        // NOTE: Логика отправки volume_toggle УДАЛЕНА.
    }

    _refreshTrackDataForVolumeEvents() {
        // Вспомогательная функция для форматирования времени, если её нет
        const _formatTime = (seconds) => {
            if (isNaN(seconds)) return "00:00:00";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            return [h, m, s]
                .map(v => v < 10 ? "0" + v : v)
                .join(":");
        };

        if (this.currentTrack && this.playerElement) {
            const $tpl = this.playerElement.find('.now-playing');

            // Обновляем атрибуты DOM, которые используются для отправки событий
            $tpl.attr('data-uid', this.currentTrack.uid || '');
            $tpl.attr('data-title', this.currentTrack.title || '');
            $tpl.attr('data-artist', this.currentTrack.artist || '');

            // Предполагая, что this.audioTrack существует и играет
            const durationPlayed = _formatTime(this.audioTrack?.currentTime) || this.currentTrack.duration_played || "00:00:00";
            $tpl.attr('data-duration_played', durationPlayed);
            $tpl.attr('data-duration', this.currentTrack.duration || "00:00:00");
        }
    }

    controllersOff(off=false) {
        if(off) {
            $('.action-btn:has(.fa-backward-step), .action-btn:has(.fa-play), .action-btn:has(.fa-forward-step), .action-btn.sort').hide()
        } else {
            $('.action-btn:has(.fa-backward-step), .action-btn:has(.fa-play), .action-btn:has(.fa-forward-step), .action-btn.sort').show()
        }
    }




    show() {
        // Если плеер уже существует — вставляем в DOM и обновляем
        if (this.playerElement) {
            $('body').append(this.playerElement);
            this._updateSettingsUI();
            return;
        }

        // Создаем элемент из шаблона
        const template = $('#player-template').html();
        this.playerElement = $(template);

        $('body').append(this.playerElement);

        if (this.isCompactMode) {
            $('.player-container.now-playing').addClass('compact-player');
            this._setupCompactControls(true);
        }

        this._updateToggleIcons();
        this._initButtons();
        this._updateSettingsUI();
    }


    /**
     * Обновляет UI, когда начинается воспроизведение.
     */
    _onPlayUI() {
        this.isPlaying = true;
        const current = this._getCurrentTrackData();
        if (!current) return;

        const { container, index, data } = current;
        // Находим конкретную карточку трека по контейнеру и индексу
        const $track = $(`${container} .${this.trackClass}[data-item-idx="${index}"]`);

        $(`.${this.trackClass}[data-uid="${data.uid}"]`)
            .addClass('active')
            .find('.play-overlay .audio-wave').removeClass('d-none');

        $(`.${this.trackClass}[data-uid="${data.uid}"]`)
            .find('.play-overlay i.fa-play').addClass('d-none');

        $track.addClass('active');
        $track.find('.play-overlay .audio-wave').removeClass('d-none');
        $track.find('.play-overlay i.fa-play').addClass('d-none');
        if (this.playerElement) {
            this.playerElement.find('[data-action="play-pause"] i').removeClass('fa-play').addClass('fa-pause');
        }
    }

    /**
     * Обновляет UI, когда воспроизведение ставится на паузу.
     */
    _onPauseUI() {
        this.isPlaying = false;
        const current = this._getCurrentTrackData();
        if (!current) return;

        const { container, index, data } = current;
        const $track = $(`${container} .${this.trackClass}[data-item-idx="${index}"]`);

        $(`.${this.trackClass}[data-uid="${data.uid}"]`)
            .find('.play-overlay .audio-wave').addClass('d-none');

        $(`.${this.trackClass}[data-uid="${data.uid}"]`)
            .find('.play-overlay i.fa-play').removeClass('d-none');
        //console.log([current, $track])
        // При паузе класс 'active' не убираем, только меняем иконку
        $track.find('.play-overlay .audio-wave').addClass('d-none');
        $track.find('.play-overlay i.fa-play').removeClass('d-none');
        if (this.playerElement) {
            this.playerElement.find('[data-action="play-pause"] i').removeClass('fa-pause').addClass('fa-play');
        }
    }

    /**
     * Полностью останавливает трек и сбрасывает его позицию.
     */
    stopTrack() {
        const current = this._getCurrentTrackData();
        if (!current || this.audioTrack.paused) return;

        const { data } = current;

        this.audioTrack.pause();
        this.audioTrack.currentTime = 0; // Сброс времени

        // !!! НОВЫЙ КОД: ОЧИСТКА ИСТОЧНИКА И ЛОГ !!!
        const oldSrc = this.audioTrack.src;
        this.audioTrack.removeAttribute('src'); // Лучше, чем this.audioTrack.src = ''
        this.audioTrack.src = '';
        this.audioTrack.load(); // Принудительно очищаем буфер
        console.log(`[STOP_DEBUG] ${data.title} (${data.uid}) полностью ОСТАНОВЛЕН. Старый SRC: ${oldSrc.substring(0, 50)}...`);

        this._deactivateAll(); // Сброс UI

        this._sendEventToServer("track_stop", {
            uid: data.uid,
            title: data.title,
            artist: data.artist,
            duration_played: "00:00:00",
            duration: data.duration,
            source: this.mode
        });
        console.log("Track stopped and reset.");
    }

    _toggleCounters() {
        const $counters = $('.counters');
        const isShowing = $counters.hasClass('show');

        if (isShowing) {
            // Скрыть блок
            $counters.removeClass('show').addClass('hide');
            setTimeout(() => {
                $counters.css('display', 'none');
            }, 300); // Задержка соответствует времени анимации
        } else {
            // Показать блок
            $counters.css('display', 'flex');
            $counters.removeClass('hide').addClass('show');
        }
    }

    _initButtons() {
        const $player = this.playerElement;
        const _this = this;

        if (!this.currentPlaylist) {
            for (const container in this.playlists) {
                if (this.playlists[container].currentIndex !== undefined) {
                    this.currentPlaylist = container;
                    break;
                }
            }
        }


        // Скрываем/показываем кнопки по умолчанию
        $player.find('[data-action="edit"]').hide();
        $player.find('[data-action="assignToEvent"]').hide();
        $player.find('[data-action="tourInfo"]').hide();
        $player.find('[data-action="deleteTrack"]').hide();



        $player.find('[data-action="copyId"]').off('click').on('click', () => {
            this.copyLinkToClipboard($('.now-playing').attr('data-id'), false)
        });

        $player.find('[data-action="copyUid"]').off('click').on('click', () => {
            this.copyLinkToClipboard($('.now-playing').attr('data-uid'), false)
        });

        $player.find('.counter-button').on('click', () => {
            this._toggleCounters();
        });

        $player.find('[data-action="next"]').on('click', () => {
            if (this.currentPlaylist) {
                this.nextTrack(this.currentPlaylist);
            } else {
                console.warn("Активный плейлист не найден");
            }
        });

        $player.find('[data-action="prev"]').on('click', () => {
            if (this.currentPlaylist) {
                this.prevTrack(this.currentPlaylist);
            } else {
                console.warn("Активный плейлист не найден");
            }
        });

        $player.find('[data-action="play-pause"]').on('click', () => {
            this.togglePlayPause();
        });

        $player.find('[data-action="edit"]').on('click', (e) => {
            this.editHandler();
        });

        $player.find('[data-action="deleteTrack"]').on('click', (e) => {
            const data = {
                uid: $('.now-playing').attr('data-uid'),
                title: $('.now-playing').attr('data-title'),
                artist: $('.now-playing').attr('data-artist'),
                duration_played: $('.now-playing').attr('data-duration_played'),
                duration: $('.now-playing').attr('data-duration'),
                source: "track",
                author: $('.now-playing').attr('data-name')
            }
            this.deleteHandler(data);
        });

        $player.find('[data-action="removeTrackFromAir"]').on('click', (e) => {
            const data = {
                uid: $('.now-playing').attr('data-uid'),
                title: $('.now-playing').attr('data-title'),
                artist: $('.now-playing').attr('data-artist'),
                duration_played: $('.now-playing').attr('data-duration_played'),
                duration: $('.now-playing').attr('data-duration'),
                source: "track",
                author: $('.now-playing').attr('data-name')
            }
            this.removeTrackFromAirHandler(data);
        });

        $player.find('[data-action="toggle-compact"]').on('click', (e) => {
            this.toggleCompactMode();
        });

        /*$player.find('.volume-toggle').on('click', () => {
			const muted = !this.audioTrack.muted;
			this.soundOff(muted);
			const icon = this.audioTrack.muted ? 'fa-volume-mute' : 'fa-volume-up';
			$player.find('.volume-toggle i').removeClass('fa-volume-up fa-volume-mute').addClass(icon);
			this._sendVolumeToggleEvent();
		});*/

        $player.find('[data-action]').on('click', (e) => {
            const action = $(e.target).closest('[data-action]').data('action');
            const data = {
                uid: $('.now-playing').attr('data-uid'),
                title: $('.now-playing').attr('data-title'),
                artist: $('.now-playing').attr('data-artist'),
                duration_played: $('.now-playing').attr('data-duration_played'),
                duration: $('.now-playing').attr('data-duration'),
                source: "track",
                author: $('.now-playing').attr('data-name')
            }
            this.handlePlayerMenuAction(action, data);
        });

        if (this.user.chatId === 1) {
            $player.find('[data-action="like"]').remove()
        } else {
            $player.find('[data-action="like"]').on('click', (e) => {
                e.stopPropagation();

                const data = {
                    uid: $('.now-playing').attr('data-uid'),
                    title: $('.now-playing').attr('data-title'),
                    artist: $('.now-playing').attr('data-artist'),
                    duration_played: $('.now-playing').attr('data-duration_played'),
                    duration: $('.now-playing').attr('data-duration'),
                    source: "track"
                }

                if (typeof this.likeCallback === 'function') {
                    this.likeCallback(data);
                }

                this._sendEventToServer("track_like", data);
            });
        }

        if (this.user.chatId === 1) {
            $player.find('[data-action="fav"]').remove()
        } else {
            $player.find('[data-action="fav"]').on('click', (e) => {
                e.stopPropagation();

                const data = {
                    uid: $('.now-playing').attr('data-uid'),
                    title: $('.now-playing').attr('data-title'),
                    artist: $('.now-playing').attr('data-artist'),
                    duration_played: $('.now-playing').attr('data-duration_played'),
                    duration: $('.now-playing').attr('data-duration'),
                    source: "track"
                }

                if (typeof this.favCallback === 'function') {
                    this.favCallback(data);
                }

                this._sendEventToServer("track_fav", data);
            });
        }


        this.$repeatButton = $player.find('[data-action="repeat"]');
        this.$shuffleButton = $player.find('[data-action="shuffle"]');
        this.$audioSettingsToggle = $player.find('.audio-settings-toggle');
        this.$playbackSpeedToggle = $player.find('.playback-speed-toggle');
        this.$playbackSpeedOptions = $player.find('.playback-speed-option');

        _this.$audioSettingsCollapse = $player.find('#audioSettingsCollapse');
        _this.$playbackSpeedCollapse = $player.find('#playbackSpeedCollapse');

        $player.find('[data-action="repeat"]').off('click').on('click', this.toggleRepeatMode.bind(this));
        $player.find('[data-action="shuffle"]').off('click').on('click', this.toggleShuffleMode.bind(this));

        $player.find('[data-action]').on('click', (e) => {
            const action = $(e.target).closest('[data-action]').data('action');
            if (action === 'repeat' || action === 'shuffle') {
                return;
            }
        });

        this.$playbackSpeedOptions.on('click', (e) => {
            const speed = parseFloat($(e.currentTarget).data('speed'));
            this.setPlaybackRate(speed);
        });

        $(document).on('click', (e) => {
            const $target = $(e.target);

            const isClickOutsideAudioSettingsArea =
                !$target.closest(_this.$audioSettingsCollapse).length &&
                !$target.closest(_this.$audioSettingsToggle).length;

            const isClickOutsidePlaybackSpeedArea =
                !$target.closest(_this.$playbackSpeedCollapse).length &&
                !$target.closest(_this.$playbackSpeedToggle).length;

            if (_this.$playbackSpeedCollapse.length && _this.$playbackSpeedCollapse.hasClass('show') && isClickOutsidePlaybackSpeedArea) {
                _this.$playbackSpeedCollapse.collapse('hide');
            }

            if (_this.$audioSettingsCollapse.length && _this.$audioSettingsCollapse.hasClass('show') && isClickOutsideAudioSettingsArea) {
                _this.$audioSettingsCollapse.collapse('hide');
            }
        });

        $player.find('.progress-bar-container').on('click', e => {
            e.stopPropagation();
            e.preventDefault();

            if (this.mode === 'radio') {
                return
            }

            const audio = this.audioTrack;
            if (!audio || !audio.duration || isNaN(audio.duration)) {
                e.stopPropagation();
                console.warn("Аудио не готово для перемотки");
                return;
            }

            const $bar = $(e.currentTarget);
            const rect = $bar[0].getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = clickX / $bar.width();
            this.audioTrack.currentTime = pct * this.audioTrack.duration;
        });

        _this._updatePlayerModeUI();

        this._initTrackContextMenu();
    }

    _resyncPlaylistIndexes(container) {
        const pl = this.playlists[container];
        if (!pl) return;

        const $tracks = $(`${container} .${this.trackClass}`);
        $tracks.each((i, el) => {
            $(el).attr('data-item-idx', i);
            if (pl.list[i]) {
                pl.list[i].$el = $(el);
            }
        });

        console.log(`Resynced playlist indexes for ${container}.`);
    }


    _initTrackContextMenu() {
        const _this = this;

        // обработка ПКМ / долгого тапа
        $('body').off('contextmenu.trackCard').on('contextmenu.trackCard', '.track-card', function(e) {
            e.preventDefault();

            const $trackCard = $(this);
            const $contextMenu = $('#trackContextMenu');

            // ⚡️ Берём данные динамически через attr(), а не .data()
            const trackData = {
                id: $trackCard.attr('data-id'),
                uid: $trackCard.attr('data-uid'),
                name: $trackCard.attr('data-name'),
                ownerId: $trackCard.attr('data-ownerid'),
                isintour: parseInt($trackCard.attr('data-isintour')) || 0,
                touruid: $trackCard.attr('data-touruid'),
                tourinfo: $trackCard.attr('data-tourinfo')
            };

            $contextMenu.find('[data-action="copyId"] .track_id').text(trackData.id);
            $contextMenu.find('[data-action="copyUid"] .track_uid').text(trackData.uid);


            // Показываем/скрываем пункты меню
            $contextMenu.find('[data-action="edit"]').hide();
            $contextMenu.find('[data-action="assignToEvent"]').hide();
            $contextMenu.find('[data-action="tourInfo"]').hide();
            $contextMenu.find('[data-action="deleteTrack"]').hide();

            const isUserOrAdmin = _this.user.isAdmin || (trackData.ownerId == _this.user.id);
            const isInTour = trackData.isintour !== 0;
            const tourUid = trackData.touruid ? `/tours/${trackData.touruid}` : "#";

            //console.log([isUserOrAdmin, isInTour, trackData, _this.user.id])

            if (isUserOrAdmin) {
                $contextMenu.find('[data-action="edit"]').show();
                $contextMenu.find('[data-action="deleteTrack"]').show();

                if (!isInTour) {
                    $contextMenu.find('[data-action="assignToEvent"]').show();
                } else {
                    if(!_this.user.isAdmin) {
                        $contextMenu.find('[data-action="edit"]').hide();
                        $contextMenu.find('[data-action="deleteTrack"]').hide();
                    }
                    const tourInfoText = trackData.tourinfo || "Участвовал в туре";
                    $contextMenu.find('[data-action="tourInfo"] a')
                        .text(tourInfoText).attr('href', tourUid);
                    $contextMenu.find('[data-action="tourInfo"]').show();
                }
            } else if (isInTour) {
                $contextMenu.find('[data-action="edit"]').hide();
                $contextMenu.find('[data-action="deleteTrack"]').hide();

                const tourInfoText = trackData.tourinfo || "Участвовал в туре";
                $contextMenu.find('[data-action="tourInfo"] a')
                    .text(tourInfoText).attr('href', tourUid);
                $contextMenu.find('[data-action="tourInfo"]').show();
            }

            if(trackData.name === 'AIMEDIA.BAR:podcast') {
                $contextMenu.find('[data-action="assignToEvent"]').hide();
                $contextMenu.find('[data-action="tourInfo"]').hide();
            }

            // сохраняем текущий элемент (без .data())
            $contextMenu.data('$currentTrackCard', $trackCard);

            $contextMenu.css({ display: 'block', visibility: 'hidden' }); // сначала показать для измерения
            const menuWidth = $contextMenu.outerWidth();
            const menuHeight = $contextMenu.outerHeight();
            $contextMenu.css({ display: 'none', visibility: 'visible' });

            const winWidth = $(window).width();
            const winHeight = $(window).height();

            let left = e.pageX;
            let top = e.pageY;

            // если не влазит справа → сдвигаем влево
            if (left + menuWidth > winWidth) {
                left = winWidth - menuWidth - 10; // 10px отступ
                if (left < 0) left = 0;
            }

            // если не влазит снизу → сдвигаем вверх
            if (top + menuHeight > winHeight) {
                top = winHeight - menuHeight - 10;
                if (top < 0) top = 0;
            }

            $contextMenu.css({
                left: left + 'px',
                top: top + 'px',
                display: 'block'
            });
        });

        // обработка клика по пунктам меню
        $('#trackContextMenu').off('click.contextMenu').on('click.contextMenu', 'li', function() {
            const $contextMenu = $('#trackContextMenu');
            const $currentTrackCard = $contextMenu.data('$currentTrackCard');
            const action = $(this).data('action');

            if ($currentTrackCard && action) {
                // ⚡️ снова берём актуальные данные через attr()
                const trackData = {
                    id: $currentTrackCard.attr('data-id'),
                    uid: $currentTrackCard.attr('data-uid'),
                    title: $currentTrackCard.attr('data-title'),
                    artist: $currentTrackCard.attr('data-artist'),
                    ownerId: $currentTrackCard.attr('data-ownerid')
                };

                if (action === 'edit') {
                    _this.uploader?.edit($currentTrackCard);
                } else if (action === 'assignToRadio') {
                    _this.openAssignRadioModal(trackData);
                } else if (action === 'assignToEvent') {
                    _this.openAssignTourModal(trackData);
                } else if (action === 'copyId') {
                    _this.copyLinkToClipboard(trackData.id, false);
                } else if (action === 'copyUid') {
                    _this.copyLinkToClipboard(trackData.uid, false);
                } else if (action === 'share') {
                    _this.copyLinkToClipboard(`https://aimedia.bar/song/${trackData.uid}`, false);
                } else if (action === 'deleteTrack') {
                    _this.deleteHandler(trackData);
                } else if (action === 'removeTrackFromAir') {
                    _this.removeTrackFromAirHandler(trackData);
                }
            }

            $contextMenu.hide();
        });

        // закрытие по клику вне
        $(document).off('click.hideContextMenu').on('click.hideContextMenu', function(e) {
            const $contextMenu = $('#trackContextMenu');
            if (!$(e.target).closest('#trackContextMenu').length && $contextMenu.is(':visible')) {
                $contextMenu.hide();
            }
        });

        // долгий тап = ПКМ
        let pressTimer;
        const LONG_PRESS_THRESHOLD = 500;

        $('body').off('touchstart.trackCard touchend.trackCard touchmove.trackCard')
            .on({
                'touchstart.trackCard': function(e) {
                    const $trackCard = $(this);
                    const touchEvent = e.originalEvent.touches[0];
                    pressTimer = setTimeout(() => {
                        $trackCard.trigger($.Event('contextmenu', {
                            pageX: touchEvent.pageX,
                            pageY: touchEvent.pageY
                        }));
                    }, LONG_PRESS_THRESHOLD);
                },
                'touchend.trackCard': function() { clearTimeout(pressTimer); },
                'touchmove.trackCard': function() { clearTimeout(pressTimer); }
            }, '.track-card');
    }


    editHandler() {
        console.log('Вызвана функция редактирования трека из плеера.');
        const $currentPlayingTrackCard = $('.player-container.now-playing')//this.playerElement.find('.now-playing');
        if ($currentPlayingTrackCard.length) {
            this.uploader.edit($currentPlayingTrackCard);
        } else {
            console.warn("Нет активного трека для редактирования в плеере или TrackUploader не доступен.");
        }
    }

    deleteHandler(trackData) {
        console.log('Вызвана функция удаления трека');
        if (typeof this.onDeleteCallback === 'function') {
            this.onDeleteCallback(trackData);
        }
    }

    removeTrackFromAirHandler(trackData) {
        console.log('Вызвана функция Убрать трек из эфира');
        if (typeof this.onRemoveTrackFromAirCallback === 'function') {
            this.onRemoveTrackFromAirCallback(trackData);
        }
    }


    /**
     * Устанавливает или восстанавливает контролы плеера.
     * @param {boolean} isSetup - true для сворачивания (перемещение), false для разворачивания (восстановление).
     */
    _setupCompactControls(isSetup) {
        let playerElement = $('.player-container.now-playing');
        const controlsBar = playerElement.find('.footer-container .controls-bar');
        const menuContainer = playerElement.find('.top-container .track-actions');

        if (isSetup) {
            // Логика СВОРАЧИВАНИЯ (Остается без изменений)
            const volumeWrapper = controlsBar.find('.volume-control-wrapper').detach();
            const playPause = controlsBar.find('[data-action="play-pause"]').detach();
            const nextButton = controlsBar.find('[data-action="next"]').detach();

            if (!this.compactControlsContainer || !this.compactControlsContainer.length) {
                this.compactControlsContainer = $('<div class="compact-controls"></div>');
            }

            this.compactControlsContainer.append(volumeWrapper);
            this.compactControlsContainer.append(playPause);
            this.compactControlsContainer.append(nextButton);

            menuContainer.prepend(this.compactControlsContainer);

        } else {
            // Логика РАЗВОРАЧИВАНИЯ (Восстановление Volume, Play/Pause, Next)
            if (this.compactControlsContainer && this.compactControlsContainer.length) {

                // 1. Volume: в начало controls-bar
                const volumeWrapperToRestore = this.compactControlsContainer.find('.volume-control-wrapper').detach();
                controlsBar.prepend(volumeWrapperToRestore);

                // 2. Play/Pause: после кнопки Prev
                const playPauseToRestore = this.compactControlsContainer.find('[data-action="play-pause"]').detach();
                const prevButton = controlsBar.find('[data-action="prev"]');

                let playPauseElement;

                // Используем .insertAfter() для корректного размещения в DOM и получения ссылки
                if (prevButton.length) {
                    playPauseElement = playPauseToRestore.insertAfter(prevButton);
                } else {
                    // Если Prev нет, вставляем после Volume
                    playPauseElement = playPauseToRestore.insertAfter(controlsBar.find('.volume-control-wrapper'));
                }

                // 3. Next: после кнопки Play/Pause
                const nextButtonToRestoreFinal = this.compactControlsContainer.find('[data-action="next"]').detach();

                // Вставляем Next СРАЗУ после Play/Pause, которую мы только что вставили
                if (playPauseElement && playPauseElement.length) {
                    nextButtonToRestoreFinal.insertAfter(playPauseElement);
                } else {
                    // Если Play/Pause не нашлась, вставляем Next после Volume или Prev (как запасной вариант)
                    const anchor = controlsBar.find('[data-action="prev"]').length ? controlsBar.find('[data-action="prev"]') : controlsBar.find('.volume-control-wrapper');
                    nextButtonToRestoreFinal.insertAfter(anchor);
                }

                // 4. Очистка
                if (this.compactControlsContainer.children().length === 0) {
                    this.compactControlsContainer.remove();
                    this.compactControlsContainer = null;
                }
            }
        }
    }

    toggleCompactMode() {
        this.isCompactMode = !this.isCompactMode;

        // 1. Сохраняем состояние
        localStorage.setItem(this.compactModeKey, this.isCompactMode);

        let playerElement = $('.player-container.now-playing');
        const dropdownElement = playerElement.find('.top-container .track-actions .dropdown');

        if (this.isCompactMode) {
            playerElement.addClass('compact-player');
            dropdownElement.addClass('dropup');

            this._setupCompactControls(true);

            $('#volumeControlCollapse').collapse('hide');
            $('#audioSettingsCollapse').collapse('hide');

        } else {
            playerElement.removeClass('compact-player');
            dropdownElement.removeClass('dropup');

            this._setupCompactControls(false);
        }

        this._updateToggleIcons();
    }


    // Внутри класса Player
    _updateToggleIcons() {
        // 1. Находим все элементы, использующие data-action="toggle-compact" (меню и ярлык)
        const toggles = $('.player-container.now-playing').find('[data-action="toggle-compact"]');

        toggles.each((i, el) => {
            const btn = $(el);
            const isMenuButton = btn.hasClass('dropdown-item'); // Определяем кнопку меню

            if (this.isCompactMode) {
                // КОМПАКТНЫЙ РЕЖИМ: Должен показывать "Развернуть"

                if (isMenuButton) {
                    // 1. Кнопка в меню: меняем иконку и текст
                    const icon = btn.find('i');
                    icon.removeClass('fa-compress').addClass('fa-expand');
                    btn.find('.compact-text').text('Развернуть');
                } else {
                    // 2. Ярлык: меняем текст и подсказку
                    btn.find('.tab-text').text('Развернуть'); // <-- ИЗМЕНЕНИЕ: меняем текст в span
                    btn.attr('title', 'Развернуть плеер');
                }
            } else {
                // ПОЛНЫЙ РЕЖИМ: Должен показывать "Свернуть"

                if (isMenuButton) {
                    // 1. Кнопка в меню: меняем иконку и текст
                    const icon = btn.find('i');
                    icon.removeClass('fa-expand').addClass('fa-compress');
                    btn.find('.compact-text').text('Свернуть');
                } else {
                    // 2. Ярлык: меняем текст и подсказку
                    btn.find('.tab-text').text('Свернуть'); // <-- ИЗМЕНЕНИЕ: меняем текст в span
                    btn.attr('title', 'Свернуть плеер');
                }
            }
        });
    }


    openShareModal(currentTrack) {
        const shareModalOverlay = $('#shareModalOverlay');
        const shareModal = $('#shareModalOverlay .container-modal');

        shareModalOverlay
            .attr('data-title', currentTrack.title)
            .attr('data-artist', currentTrack.artist)
            .attr('data-uid', currentTrack.uid)

        //console.log(currentTrack)

        // Заполняем данные о треке
        shareModal.find('.track-title').text(currentTrack.title || 'Название трека').attr('href', `/song/${currentTrack.uid}`);
        shareModal.find('.track-artist').text(currentTrack.artist || 'Исполнитель').attr('href',`/author/${currentTrack.author}`);
        shareModal.find('#shareUrl').text(`https://aimedia.bar/song/${currentTrack.uid}`);

        shareModal.find('.track-cover').css('background-image', `url(/cover/${currentTrack.uid})`);

        shareModal.find('.track-title').closest('.marquee-container')
            .data('marquee-initialized', false)
            .marquee();

        shareModal.find('.track-artist').closest('.marquee-container')
            .data('marquee-initialized', false)
            .marquee();

        // Открываем модальное окно
        shareModalOverlay.removeClass('d-none');
        shareModalOverlay.show();
    }

    // Метод для закрытия модального окна
    closeShareModal() {
        $('#shareModalOverlay').addClass('d-none');
        $('#shareModalOverlay').hide();
    }

    // Обработчик события для кнопки "Скопировать"
    copyLinkToClipboard(url, share=true) {
        if (!url) return;

        navigator.clipboard.writeText(url)
            .then(() => {
                sendMsg('info', 'Данные скопированы!', 'info');

                if(share) {
                    const uid = $('#shareModalOverlay').attr('data-uid');

                    if (typeof this.shareCallback === 'function') {
                        this.shareCallback({uid:uid});
                    }

                    this.closeShareModal();
                }
            })
            .catch((error) => {
                console.error('Ошибка копирования:', error);
                sendMsg('error', 'Не удалось скопировать данные.', 'error');
            });
    }

    bindShareModalEvents() {
        const self = this;
        const shareTitle = "AIMEDIA.BAR";
        const domain = "https://aimedia.bar";

        // Кнопка "Скопировать"
        $('#copyLinkButton').off('click').on('click', function () {
            const shareModalOverlay = $('#shareModalOverlay');
            const shareUrl = `${domain}/song/${shareModalOverlay.attr('data-uid')}`
            self.copyLinkToClipboard(shareUrl);
        });

        // Кнопка закрытия модального окна
        $('#shareModalOverlay #closeModalButton').off('click').on('click', function () {
            self.closeShareModal();
        });

        // Универсальная кнопка шаринга
        $('#universalShareButton').off('click').on('click', async function () {
            const shareModalOverlay = $('#shareModalOverlay');

            const shareUrl = `${domain}/song/${shareModalOverlay.attr('data-uid')}`
            const coverImage = `${domain}/cover/${shareModalOverlay.attr('data-uid')}`
            const uid = `${shareModalOverlay.attr('data-uid')}`
            const artistName = `${shareModalOverlay.attr('data-artist')}`
            const trackName = `${shareModalOverlay.attr('data-title')}`

            try {
                if (navigator.share) {
                    await navigator.share({
                        title:  `🎵 Слушайте "${artistName}" на ${shareTitle} 🔥🔥🔥\n\n`,
                        text:   `🎵 Слушайте "${artistName}" на ${shareTitle} 🔥🔥🔥\n\n`,
                        url:    shareUrl,
                    });

                    if (typeof this.shareCallback === 'function') {
                        this.shareCallback({uid:uid});
                    }

                    self.closeShareModal();
                } else {
                    // Fallback — копируем ссылку
                    self.copyLinkToClipboard(shareUrl);
                }
            } catch (error) {
                console.log(error)
                if (error.name !== 'AbortError') {
                    sendMsg('error', 'Не удалось поделиться', 'error');
                }
            }
            self.closeShareModal();
        });
    }

    openSupportModal(currentTrack) {
        const modal = $('#supportModalOverlay');
        const titleEl = $('.track-title', modal);
        const artistEl = $('.track-artist', modal);
        const coverEl = $('.track-cover', modal);


        modal
            .attr('data-title', currentTrack.title)
            .attr('data-artist', currentTrack.artist)
            .attr('data-uid', currentTrack.uid)

        // Заполняем информацию о треке
        titleEl.text(currentTrack.title || 'Название трека');
        artistEl.text(currentTrack.artist || 'Исполнитель');

        // Обложка как фоновое изображение
        if (currentTrack.coverImage) {
            coverEl.css('background-image', `url(/cover/${currentTrack.uid})`);
        }

        // Показываем модальное окно
        modal.removeClass('d-none');
        modal.show()
    }

    closeSupportModal() {
        $('#supportModalOverlay').addClass('d-none');
        $('#supportModalOverlay').hide();
    }

    bindSupportModalEvents() {
        const self = this;

        // Кнопка закрытия
        $('#supportModalOverlay #closeModalButton').on('click', function () {
            self.closeSupportModal();
        });

        // Отправка формы
        $('#supportForm').on('submit', async function (e) {
            e.preventDefault();

            const modal = $('#supportModalOverlay');

            // Получаем данные из формы
            const messageType = $('#messageType').val();
            const messageText = $('#messageText').val().trim();

            // Данные о треке
            const trackUid = modal.attr('data-uid');
            const trackTitle = modal.attr('data-title');
            const trackArtist = modal.attr('data-artist');

            // Данные пользователя
            const userName = self.user.name;

            // Формируем объект данных
            const data = {
                type: messageType,
                text: messageText,
                track_uid: trackUid,
                track_title: trackTitle,
                track_artist: trackArtist,
                user: userName
            };

            try {
                await $.ajax({
                    url: '/api/support',
                    type: 'POST',
                    data: data,
                    success: function (response) {
                        sendMsg('info', 'Сообщение отправлено!', 'info');
                        self.closeSupportModal();
                    },
                    error: function (xhr, status, error) {
                        sendMsg('error', 'Ошибка отправки сообщения!', 'error');
                        console.error('Ошибка:', error);
                    }
                });
            } catch (err) {
                sendMsg('error', 'Ошибка отправки сообщения!', 'error');
                console.error('Не удалось отправить сообщение:', err);
            }
        });

        // Предпросмотр изображений
        $('#screenshotInput').on('change', function (e) {
            const files = e.target.files;
            const previewContainer = $('#screenshotsPreview');
            const counterBadge = $('#counterBadge');

            previewContainer.empty();
            let count = 0;

            for (let i = 0; i < files.length && count < 3; i++) {
                const file = files[i];
                if (!file.type.startsWith('image/')) continue;

                const reader = new FileReader();
                reader.onload = function (event) {
                    $('<img>').attr('src', event.target.result).addClass('uploaded-screenshot').appendTo(previewContainer);
                    count++;
                    counterBadge.text(`${count}/3`);
                };
                reader.readAsDataURL(file);
            }

            if (count === 0) {
                previewContainer.html('<p>Выберите изображения</p>');
            }
        });

        // Закрытие по клику вне модального окна
        $('#supportModalOverlay').on('click', function (e) {
            if (e.target === this) {
                self.closeSupportModal();
            }
        });
    }

    // -- окно request to radio --
    openAssignRadioModal(currentTrack) {
        const modal = $('#assignRadioModalOverlay');
        const assignRadioModal = $('#assignRadioModalOverlay .container-modal');

        modal
            .attr('data-title', currentTrack.title)
            .attr('data-artist', currentTrack.artist)
            .attr('data-uid', currentTrack.uid)

        // Заполняем данные о треке
        assignRadioModal.find('.track-title').text(currentTrack.title || 'Название трека').attr('href', `/song/${currentTrack.uid}`);
        assignRadioModal.find('.track-artist').text(currentTrack.artist || 'Исполнитель').attr('href',`/author/${currentTrack.author}`);
        assignRadioModal.find('#shareUrl').text(`https://aimedia.bar/song/${currentTrack.uid}`);

        assignRadioModal.find('.track-cover').css('background-image', `url(/cover/${currentTrack.uid})`);

        assignRadioModal.find('.track-title').closest('.marquee-container')
            .data('marquee-initialized', false)
            .marquee();

        assignRadioModal.find('.track-artist').closest('.marquee-container')
            .data('marquee-initialized', false)
            .marquee();

        // Открываем модальное окно
        modal.removeClass('d-none');
        modal.show();
    }

    closeAssignRadioModal() {
        $('#assignRadioModalOverlay').addClass('d-none');
        $('#assignRadioModalOverlay').hide();
    }

    bindAssignRadioModalEvents() {
        const self = this;

        // Кнопка закрытия
        $('#assignRadioModalOverlay .close-button').on('click', function () {
            self.closeAssignRadioModal();
        });

        $('#assignRadioModalOverlay #universalAssignRadioButton').off('click').on('click', async function () {

            const modal = $('#assignRadioModalOverlay');

            // Данные о треке
            const trackUid = modal.attr('data-uid');
            const trackTitle = modal.attr('data-title');
            const trackArtist = modal.attr('data-artist');

            // Данные пользователя
            const userName = self.user.name;

            // Формируем объект данных
            const data = {
                track_uid: trackUid,
                track_title: trackTitle,
                track_artist: trackArtist,
                user: userName
            };


            try {
                await $.ajax({
                    url: `/api/track/${trackUid}/assignradio`,
                    type: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + getCookie('authToken')
                    },
                    success: function (response) {
                        sendMsg('info', 'Трек отправлен в очередь в эфир на радио', 'info');
                        self.closeAssignRadioModal();
                    },
                    error: function (xhr, status, error) {
                        sendMsg('error', xhr.responseText, 'error');
                        console.error('Ошибка:', xhr.responseText);
                    }
                });
            } catch (err) {
                sendMsg('error', err.responseText, 'error');
                console.error('Ошибка отправки трека в очередь на радио!:', err);
            }

        });

        // Закрытие по клику вне модального окна
        $('#assignRadioModalOverlay').on('click', function (e) {
            if (e.target === this) {
                self.closeAssignRadioModal();
            }
        });
    }


    onLike(callback) {
        if (typeof callback === 'function') {
            this.likeCallback = callback;
        }
    }

    onFav(callback) {
        if (typeof callback === 'function') {
            this.favCallback = callback;
        }
    }

    onShare(callback) {
        if (typeof callback === 'function') {
            this.shareCallback = callback;
        }
    }

    onTrackInfo(callback) {
        if (typeof callback === 'function') {
            this.trackInfoCallback = callback;
        } else {
            this.trackInfoCallback = null;
        }
    }

    onDelete(callback) {
        if (typeof callback === 'function') {
            this.onDeleteCallback = callback;
        }
    }

    onRemoveTrackFromAir(callback) {
        if (typeof callback === 'function') {
            this.onRemoveTrackFromAirCallback = callback;
        }
    }

    restartCurrentTrack() {
        // Получаем селектор и индекс текущего плейлиста
        const currentContainer = this.currentPlaylist; // Предполагается, что вы сохраняете текущий селектор
        const pl = this.playlists[currentContainer];

        if (pl && pl.currentIndex !== undefined) {
            // Вызываем основной метод воспроизведения для текущего индекса
            // Это инициирует весь цикл: trackinfo -> src -> play()
            this._playTrackByIndex(currentContainer, pl.currentIndex);
        } else {
            console.warn('Невозможно перезапустить трек: текущий плейлист или индекс не определены.');
        }
    }

    _sendVolumeToggleEvent() {
        const current = this._getCurrentTrackData();
        const data = current?.data || null;

        const eventData = data ? {
            uid: data.uid,
            title: data.title,
            artist: data.artist,
            duration_played: data.duration_played || "00:00",
            duration: data.duration || "00:00",
            source: this.mode
        } : {
            // Резервные данные из .now-playing
            uid: this.$cover.attr('data-track-uid'),
            title: this.$cover.attr('data-track-title'),
            artist: this.$cover.attr('data-track-artist'),
            duration_played: this.$cover.attr('data-track-duration_played') || "00:00",
            duration: this.$cover.attr('data-track-duration') || "00:00",
            source: this.mode
        };

        this._sendEventToServer("volume_toggle", eventData);
    }

    _getCurrentTrackData() {
        // 1. ПРИОРИТЕТ: Используем данные, которые плеер считает активными
        // (устанавливаются в _playTrackByIndex и _restoreState в this.currentTrack).
        if (this.currentTrack && this.currentTrack.uid) {
            const activeTrackData = this.currentTrack; // Данные играющего трека (например, "Листья")

            // 2. Ищем контейнер и индекс для этого UID в плейлистах
            for (const container in this.playlists) {
                const playlist = this.playlists[container];

                // Если плейлист еще не инициализирован (list пуст), пропускаем
                if (!playlist.list || playlist.list.length === 0) continue;

                // Ищем трек по UID
                const foundIndex = playlist.list.findIndex(item => item.data.uid === activeTrackData.uid);

                if (foundIndex !== -1) {
                    // Нашли трек в плейлисте, возвращаем полный контекст
                    return {
                        container: container,
                        index: foundIndex,
                        data: activeTrackData // Используем данные из this.currentTrack
                    };
                }
            }

            // 3. ФОЛБЭК: Если трек играет, но его нет в плейлистах (например, одиночный трек)
            // Возвращаем данные с контекстом "unknown" и index: -1. Этого достаточно для сохранения.
            return {
                container: this.currentPlaylist || 'unknown',
                index: -1,
                data: activeTrackData
            };
        }

        // 4. ФАЛБЭК К ОРИГИНАЛЬНОЙ ЛОГИКЕ (если this.currentTrack == null)
        // (Вся ваша оригинальная логика сканирования плейлистов остается здесь)

        // Сначала проверяем текущий плейлист
        if (this.currentPlaylist && this.playlists[this.currentPlaylist]) {
            const pl = this.playlists[this.currentPlaylist];
            if (pl.currentIndex !== undefined && pl.list[pl.currentIndex]) {
                return {
                    container: this.currentPlaylist,
                    index: pl.currentIndex,
                    data: pl.list[pl.currentIndex].data
                };
            }
        }

        // Ищем первый с currentIndex
        for (const container in this.playlists) {
            const playlist = this.playlists[container];
            if (playlist.currentIndex !== undefined && playlist.list[playlist.currentIndex]) {
                return {
                    container,
                    index: playlist.currentIndex,
                    data: playlist.list[playlist.currentIndex].data
                };
            }
        }

        // Нет currentIndex → берём первый трек из первого плейлиста
        const containers = Object.keys(this.playlists);
        if (containers.length > 0) {
            const firstContainer = containers[0];
            const firstPl = this.playlists[firstContainer];
            if (firstPl.list?.length > 0) {
                return {
                    container: firstContainer,
                    index: 0,
                    data: firstPl.list[0].data
                };
            }
        }

        return null;
    }

    togglePlayPause() {
        const current = this._getCurrentTrackData();
        if (!current) {
            console.warn('Нет текущего трека для воспроизведения/паузы.');
            // Если треков нет, пытаемся запустить первый из первого плейлиста
            const firstPlaylist = Object.keys(this.playlists)[0];
            if (firstPlaylist) {
                this._onTrackClick(firstPlaylist, 0);
            }
            return;
        }

        const { container, index, data } = current;

        // Проверяем: текущий ли трек загружен в audioTrack
        const uid = data.uid;
        const srcMatches = this.audioTrack.src && this.audioTrack.src.includes(`/track/${uid}`);

        if (!srcMatches) {
            // Загружаем и играем заново
            this._playTrackByIndex(container, index);
            return;
        }

        // Уже тот же трек → просто тогглим
        if (this.audioTrack.paused) {
            this.audioTrack.play().catch(err => {
                // !!! ИСПРАВЛЕНО: Добавляем игнорирование AbortError !!!
                if (err.name !== 'AbortError') {
                    console.error('Ошибка воспроизведения:', err);
                    this.isPlaying = false;
                }
            });
        } else {
            // ... (логика паузы)
            this.audioTrack.pause();
            this._sendEventToServer("track_pause", {
                uid: data.uid,
                title: data.title,
                artist: data.artist,
                duration_played: this._toTimecode(this.audioTrack.currentTime, 3),
                duration: data.duration,
                source: this.mode
            });
        }
    }


    handlePlayerMenuAction(action, currentTrack) {
        switch (action) {
            case 'radio':
                if (typeof this.menu.radio === 'function') {
                    this.menu.radio(currentTrack);
                }
                break;
            case 'info':
                if (typeof this.menu.info === 'function') {
                    this.menu.info(currentTrack);
                }
                break;
            case 'share':
                if (typeof this.menu.share === 'function') {
                    this.menu.share(currentTrack);
                }
                break;
            case 'add-to-playlist':
                if (typeof this.menu.addToPlaylist === 'function') {
                    this.menu.addToPlaylist(currentTrack);
                }
                break;
            case 'support': // <-- новый пункт
                if (typeof this.menu.support === 'function') {
                    this.menu.support(currentTrack); // передаем текущий трек (опционально)
                } else {
                    this.openSupportModal(currentTrack);
                }
                break;
            case 'assignToRadio': // <-- новый пункт
                if (typeof this.menu.assignToRadio === 'function') {
                    this.menu.assignToRadio(currentTrack); // передаем текущий трек (опционально)
                } else {
                    this.openAssignRadioModal(currentTrack);
                }
                break;
            case 'assignToEvent': // ✅ новый пункт в меню плеера
                if (typeof this.menu.assignToTour === 'function') {
                    this.menu.assignToTour(currentTrack);
                } else {
                    this.openAssignTourModal(currentTrack);
                }
                break;
        }
    }




    // Отображение обложки
    cover(containerSelector) {
        const $tpl = $($('#now-playing-template').html());
        this.$cover = $tpl;

        // Вставляем в DOM
        $(containerSelector).empty().append($tpl);

        // Кнопка громкости
        $tpl.find('.volume-toggle').on('click', () => {
            const $icon = $tpl.find('.volume-toggle i');

            const muted = !this.audioTrack.muted;

            this.soundOff(muted)

            $icon.toggleClass('fa-volume-up fa-volume-mute');
            $icon.toggleClass('active', !muted);

            this._sendEventToServer("volume_toggle", {
                uid: $tpl.attr('data-track-uid'),
                title: $tpl.attr('data-track-title'),
                artist: $tpl.attr('data-track-artist'),
                duration_played: $tpl.attr('data-track-duration_played'),
                duration: $tpl.attr('data-track-duration'),
                source: this.mode
            });
        });

        $tpl.on('click', '.progress-bar, .progress-bar .buffer-progress, .progress-bar .progress, .progress-bar small', e => {
            e.stopPropagation();
            const audio = this.mode==='radio' ? this.audioRadio : this.audioTrack;
            if(this.mode==='radio') return
            if (!audio.duration) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pct * audio.duration;

            // обновляем полосу и цифры
            $tpl.find('.progress-bar .progress').css('width', (pct*100)+'%');
            $tpl.find('.elapsed-time').text(this._toTimecode(audio.currentTime,3));
        });

        return this;
    }

    showCover(data, row = 0) {
        /*if ($('.now-playing').attr('data-uid') !== data.uid) {
			this._loadTrackExtraInfo(data.uid);
		}*/

        $('.now-playing').each(function () {
            $.each(this.attributes, function () {
                if (this !== undefined && this.name !== undefined && this.name !== "" && this.name.startsWith('data-')) {
                    $(this.ownerElement).removeAttr(this.name);
                }
            });
        });

        Object.keys(data).forEach(k => $('.now-playing').attr(`data-${k}`, data[k]));

        $('.now-playing').attr("data-track-duration_played", data.currentState || this._toTimecode(this.audioTrack.currentTime, 3))


        // Обновляем обложку только при необходимости
        const coverImage = $('.now-playing-img');
        const currentUid = coverImage.attr('data-uid');
        const imgUrl = `/cover/${data.uid}?width=360&ts=${Date.now()}`
        const currentCoverSrc = coverImage.attr('src');

        /*if (currentCoverSrc !== imgUrl) {
			coverImage.attr('src', imgUrl);
			$('.bg-blur').css('background-image', `url(${imgUrl})`);
		}*/

        if (currentUid !== data.uid) {
            const imgUrl = `/cover/${data.uid}?width=360&ts=${Date.now()}`;
            coverImage.attr('src', imgUrl).attr('data-uid', data.uid); // сохраняем uid для сравнения
            $('.bg-blur').css('background-image', `url(/cover/${data.uid})`);
        }

        // Заголовок трека
        const titleElement = $('.now-playing-title');
        const currentTitle = this._capitalize(titleElement.text());
        if (currentTitle !== this._capitalize(data.title)) {
            titleElement.text(this._capitalize(data.title)).attr('href', `/song/${data.uid}`);

            // ре-инициализируем marquee для заголовка
            const $titleContainer = titleElement.closest('.marquee-container');
            $titleContainer
                .data('marquee-initialized', false)
                .marquee();
        }

        // Исполнитель
        const artistElement = $('.now-playing-artist');
        const currentArtist = this._capitalize(artistElement.text());
        if (currentArtist !== this._capitalize(data.artist)) {
            artistElement.text(this._capitalize(data.artist)).attr("href", `/author/${data.name}`);

            // ре-инициализируем marquee для артиста
            const $artistContainer = artistElement.closest('.marquee-container');
            $artistContainer
                .data('marquee-initialized', false)
                .marquee();
        }

        // Общее время
        const totalTimeElement = $('.total-time');
        const currentTotalTime = totalTimeElement.text();
        const currentTotalDuration = this._toSeconds(data.duration || '00:00:00');
        const currentTotalDurationStr = this._toTimecode(currentTotalDuration, 3);

        if (currentTotalTime !== currentTotalDurationStr) {
            totalTimeElement.text(currentTotalDurationStr);
        }

        // Прошедшее время
        const elapsedTimeElement = $('.elapsed-time');
        const currentElapsedTime = elapsedTimeElement.text();
        const currentElapsedDuration = this._toSeconds(data.currentState || '00:00:00');
        const currentElapsedDurationStr = this._toTimecode(currentElapsedDuration, 3);

        if (currentElapsedTime !== currentElapsedDurationStr) {
            elapsedTimeElement.text(currentElapsedDurationStr);
        }

        const pos = this._toSeconds('00:00:00');
        const dur = this._toSeconds('00:00:00');
        this._updateCoverProgress(pos, dur);

        $('.player-container.now-playing .track-genres').text(data.genre);

        // Обновление прогресса
        if (this.mode === 'track') {

            this.audioTrack.addEventListener('timeupdate', () => {
                const pos = this.audioTrack.currentTime || 0;
                const dur = this.audioTrack.duration || this._toSeconds(data.duration);

                // Расчет дельты времени для чистого прослушивания
                /*const now = Date.now() / 1000; // Текущее время в секундах
				if (this.lastUpdateTime === 0) {
					this.lastUpdateTime = now; // Инициализация при первом обновлении
				}
				const deltaTime = now - this.lastUpdateTime;
				this.lastUpdateTime = now; // Обновление времени последнего обновления

				// Накапливаем pureListeningTime только если трек играет и не происходит перемотка
				if (!this.audioTrack.paused && !this.audioTrack.seeking) {
					this.pureListeningTime += deltaTime;
				}*/

                $('.now-playing').attr('data-track-duration_played', this._toTimecode(pos, 3));

                this._updateCoverProgress(pos, dur);

                /*if (!this.audioTrack.muted && this.pureListeningTime > 12 && !this.listeningEventSentForCurrentTrack) {
					//console.log([dur, this._toTimecode(dur, 3)])
					this._sendEventToServer("track_listening", {
						uid: data.uid,
						title: data.title,
						artist: data.artist,
						duration_played: this._toTimecode(this.pureListeningTime, 3),
						duration: this._toTimecode(dur, 3),
						source: this.mode
					});
					this.listeningEventSentForCurrentTrack = true; // Установить флаг, чтобы не отправлять повторно
				}*/
            });

            this.audioTrack.addEventListener('pause', () => {
                const currentTime = this.audioTrack.currentTime;
                $('.now-playing').attr('data-track-duration_played', this._toTimecode(currentTime, 3));
            });

            this.audioTrack.addEventListener('seeking', () => {
                const seekTime = this.audioTrack.currentTime;
                $('.now-playing').attr('data-track-duration_played', this._toTimecode(seekTime, 3));
            });
        } else if (this.mode === 'radio') {
            const pos = this._toSeconds(data.currentState || '00:00:00');
            const dur = this._toSeconds(data.duration || '00:00:00');
            this._updateCoverProgress(pos, dur);
        }


    }


    _updateCoverProgress(pos, dur) {
        const pct = dur ? (pos / dur) * 100 : 0;
        $('.progress').css('width', pct + '%');
        $('.elapsed-time').text(this._toTimecode(pos, 3));
        $('.progress-bar-container .progress-bar').css('width', pct + '%');
    }

    createOffcanvasPlaylist(container, data, options = {}) {
        // Полный аналог setPlayList → вызывает createPlaylist
        return this.createPlaylist(container, data, {
            playlistName: options.playlistName || 'offcanvas-playlist',
            isFolder: false,
            isChecked: false
        });
    }

    createPlaylistInternal(container, data, options) {
        if (!data || data.length === 0) return null;

        const isGlobalShufflePool = container === this.GLOBAL_SHUFFLE_KEY;


        // 1. Если это Глобальный Пул и он УЖЕ СУЩЕСТВУЕТ
        if (isGlobalShufflePool && this.playlists[container]) {
            const existingPl = this.playlists[container];
            const existingUids = new Set(existingPl.list.map(item => item.uid));
            let addedCount = 0;

            // Собираем уникальные новые треки для добавления
            // Мы принимаем на вход ВСЕ видимые треки (data), но добавляем только уникальные
            const newTracks = data.map(trackData => ({
                uid: trackData.uid,
                data: trackData,
                element: null // DOM-элемент не создается
            })).filter(item => {
                // Проверка на уникальность: если UID уже есть в существующем плейлисте
                // (или был добавлен ранее в этой же итерации фильтра), пропускаем.
                if (!existingUids.has(item.uid)) {
                    existingUids.add(item.uid); // Добавляем новый UID в Set для текущей проверки
                    addedCount++;
                    return true;
                }
                return false;
            });

            // Добавляем новые уникальные треки в конец списка
            if (newTracks.length > 0) {
                existingPl.list.push(...newTracks);
                console.log(`[Shuffle Pool] Обновлен. Добавлено ${addedCount} новых треков. Всего: ${existingPl.list.length}`);

                // Если включен шафл, обновляем shuffledList (просто добавляем индексы новых треков)
                if (this.shuffleMode === 'shuffle-on' && typeof this._getShuffledArray === 'function') {
                    // Генерируем новые индексы, начиная с того места, где закончился старый список
                    const startIndex = existingPl.list.length - addedCount;
                    const newIndices = Array.from({ length: addedCount }, (_, i) => startIndex + i);

                    // Перемешиваем только новые индексы и добавляем их в shuffledList
                    const shuffledNewIndices = this._getShuffledArray(newIndices);
                    existingPl.shuffledList.push(...shuffledNewIndices);
                    console.log(`[Shuffle Pool] Перемешаны и добавлены новые индексы в shuffledList.`);
                }
            }

            if (isGlobalShufflePool) {


            }


            return existingPl;
        }

        // 2. Стандартное создание плейлиста (если пула нет или это не пул)
        const list = data.map(trackData => ({
            uid: trackData.uid,
            data: trackData,
            element: null // Элемент DOM не создается
        }));

        this.playlists[container] = {
            container: container,
            list: list,
            currentIndex: -1,
            options: options || {},
            shuffledList: [],
            shuffledCurrentIndex: -1,
        };

        // Если это только что созданный Глобальный Пул и шафл включен, перемешиваем
        if (isGlobalShufflePool && this.shuffleMode === 'shuffle-on' && typeof this._getShuffledArray === 'function') {
            const indicesToShuffle = list.map((item, index) => index);
            this.playlists[container].shuffledList = this._getShuffledArray(indicesToShuffle);
            this.playlists[container].shuffledCurrentIndex = 0;
            console.log(`[Shuffle Pool] Создан и немедленно перемешан. Треков: ${list.length}`);
        }



        return this.playlists[container];
    }

    _updateGlobalShufflePool() {
        const allUniqueTracks = new Map();

        // 1. Собираем уникальные треки из всех ВИДИМЫХ плейлистов
        for (const container in this.playlists) {
            if (container === this.GLOBAL_SHUFFLE_KEY) continue; // Игнорируем сам глобальный пул

            const pl = this.playlists[container];

            // Проверяем, что это не временный/пустой/папка плейлист, и что он был отрендерен (list не пуст)
            if (pl && pl.list && pl.list.length > 0 && !pl.options?.isFolder) {

                for (const item of pl.list) {
                    // Поскольку createPlaylist сохраняет {data, $el}, берем item.data
                    if (item.data && item.data.uid) {
                        // Используем Map для обеспечения уникальности по UID
                        if (!allUniqueTracks.has(item.data.uid)) {
                            allUniqueTracks.set(item.data.uid, item.data);
                        }
                    }
                }
            }
        }

        // Преобразуем Map обратно в массив данных треков
        const newGlobalTracksData = Array.from(allUniqueTracks.values());
        const globalShuffleKey = this.GLOBAL_SHUFFLE_KEY;

        // 2. Обновляем (или создаем) невидимый глобальный плейлист.
        // Метод createPlaylistInternal теперь сам содержит логику
        // проверки на существование пула и добавления только уникальных треков.

        if (newGlobalTracksData.length > 0) {
            // Вызываем createPlaylistInternal для инкрементального обновления/создания
            this.createPlaylistInternal(globalShuffleKey, newGlobalTracksData, {
                playlistName: globalShuffleKey,
                isFolder: false,
                isChecked: false
            });
        } else if (this.playlists[globalShuffleKey]) {
            // Если видимых треков нет, но пул существует, очищаем его
            this.playlists[globalShuffleKey].list = [];
            this.playlists[globalShuffleKey].shuffledList = [];
            console.log('Глобальный пул шафла очищен, так как нет видимых треков.');
        }
    }

    // Создание плейлиста
    createPlaylist(containerInput, dataArray, {
        isFirstTrack = false,
        playlistName = '',
        onLike = null,
        onFav = null,
        onShare = null,
        isFolder = false,
        isChecked = false,
    } = {}) {
        // *** 1. Определяем jQuery-объект контейнера ***
        const $actualContainer = typeof containerInput === 'string'
            ? $(containerInput)
            : containerInput;

        if ($actualContainer.length === 0) {
            console.error('Ошибка: Контейнер для плейлиста не найден!', containerInput);
            return; // Выходим, если контейнер не найден
        }

        // *** 2. Определяем СТРОКОВЫЙ СЕЛЕКТОР для использования в data-атрибутах и как ключ плейлиста ***
        let playlistSelectorString;
        if (typeof containerInput === 'string') {
            playlistSelectorString = containerInput; // Если на вход пришел строковый селектор, используем его
        } else if ($actualContainer.attr && $actualContainer.attr('id')) {
            playlistSelectorString = `#${$actualContainer.attr('id')}`; // Если это jQuery-объект с ID, используем ID
        } else {
            // Если jQuery-объект, но без простого ID, и это не строковый селектор,
            // то нужно придумать какой-то уникальный строковый идентификатор.
            console.warn("Не удалось определить простой строковый селектор для data-playlist. Возможно, это приведет к проблемам.");
            playlistSelectorString = ''; // В крайнем случае, пустая строка, но это не идеально
        }

        const list = [];
        $actualContainer.empty(); // Очищаем найденный контейнер

        if (isFolder) {
            // Создаем папку вместо обычного плейлиста
            // Здесь containerInput также должен быть строковым селектором
            this._renderFolder(containerInput, playlistName, dataArray);
        } else {
            // Создаем обычный плейлист
            dataArray.forEach((data, i) => {
                const $trk = this._createTrackElement(data, playlistSelectorString, i, isChecked);
                if(data.isRequest === 1) {
                    const $reqLabel = $(`
						<div class="absolute top-[10px] right-[10px] bg-orange-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm z-10">
							Request
						</div>
					`);

                    $trk.append($reqLabel);
                }
                $trk.attr('data-ischecked', isChecked ? 1 : 0);
                $actualContainer.append($trk);
                list.push({ data, $el: $trk });
            });

            // *** КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Учет восстановленного состояния ***
            let initialIndex = -1;

            const playingTrack = this._getCurrentTrackData()?.data;
            if (playingTrack && this.isPlaying && this.mode === 'track') {
                const playingUid = playingTrack.uid;
                const foundIndex = list.findIndex(item => item.data.uid === playingUid);

                if (foundIndex !== -1) {
                    initialIndex = foundIndex;
                    this.currentPlaylist = playlistSelectorString;

                    const $activeTrackElement = list[initialIndex].$el;

                    if ($activeTrackElement && $activeTrackElement.length > 0) {
                        // Активируем элемент в списке
                        $activeTrackElement.addClass('active');

                        // Устанавливаем иконку Playing (аудио волну)
                        $activeTrackElement.find('.play-overlay .audio-wave').removeClass('d-none');
                        $activeTrackElement.find('.play-overlay i.fa-play').addClass('d-none');

                        console.log(`Играющий трек (UID: ${playingUid}) найден и активирован в плейлисте ${playlistSelectorString}.`);
                    }
                }
            }
            // *******************************************************

            // Сохраняем плейлист с опциями
            this.playlists[playlistSelectorString] = {
                list,
                currentIndex: initialIndex,
                // Сохраняем опции для _updateGlobalShufflePool
                options: { isFolder, playlistName, isChecked }
            };

            // === ИСПРАВЛЕНИЕ ОШИБКИ this._activateTrack ===
            // Если мы нашли восстановленный трек и он принадлежит этому плейлисту,
            // нам нужно вручную активировать его элемент в DOM.
            if (initialIndex !== -1) {
                // 1. Снимаем класс активности со всех треков в контейнере (на всякий случай)
                $actualContainer.find('.track-item.active').removeClass('active');

                // 2. Добавляем класс активности к найденному элементу трека
                const $activeTrackElement = list[initialIndex].$el;
                if ($activeTrackElement && $activeTrackElement.length > 0) {
                    $activeTrackElement.addClass('active');
                    // Также нужно активировать кнопку Play/Pause
                    this._updateToggleIcons(); // Вызываем существующий метод для обновления иконок Play/Pause
                }
            }
            // *******************************************************
        }

        // --- КЛЮЧЕВОЕ ДОБАВЛЕНИЕ: ОБНОВЛЕНИЕ ГЛОБАЛЬНОГО ШАФЛА ---
        // Вызываем обновление, если это не папка.
        if (typeof this._updateGlobalShufflePool === 'function' && !isFolder) {
            this._updateGlobalShufflePool();
        }
        // --------------------------------------------------------

        return {
            container: playlistSelectorString,

            socketOn: () => this._initSocket(playlistSelectorString),
            nextTrack: () => this.nextTrack(playlistSelectorString),
            prevTrack: () => this.prevTrack(playlistSelectorString),
            onLike: (data) => console.log('Liked:', data),
            onFav: (data) => console.log('Favorited:', data),
            onShare: (data) => console.log('Shared:', data),

            update: (callback) => {
                const pl = this.playlists[playlistSelectorString];
                if (!pl || pl.list.length === 0) {
                    console.warn('Плейлист пуст или не найден.');
                    return this;
                }

                if (this.isPlaying) {
                    console.log('Обновление невозможно: треки играют.');
                    return this;
                }

                const data = pl.list[0].data;

                pl.onUpdateCallback = callback;
                if (callback && typeof callback === 'function' && data) {
                    callback(data);
                }

                return this;
            },
            play: (callback) => {
                const pl = this.playlists[playlistSelectorString];
                if (!pl || pl.list.length === 0) {
                    console.warn('Плейлист пуст или не найден.');
                    return;
                }

                let currentTrackData;

                if (this.mode === 'track') {
                    // Режим треков: берем данные из плейлиста
                    currentTrackData = pl.list[pl.currentIndex]?.data;
                } else if (this.mode === 'radio') {
                    currentTrackData = this.currentStreamData; // Предполагается, что у вас есть данные стрима
                }

                if (!currentTrackData) {
                    console.warn('Данные текущего контента отсутствуют.');
                    return;
                }

                // Сохраняем коллбэк
                pl.onPlayCallback = callback;

                // Вызываем коллбэк с данными текущего контента
                if (callback && typeof callback === 'function' && currentTrackData) {
                    callback(currentTrackData);
                }

                return this;
            },
            rating: (user = null, eventUid = null, tourUid = null, voitedCount = 10) => {
                // Сохраняем eventUid и tourUid в объекте player
                this.currentEventUid = eventUid;
                this.currentTourUid = tourUid;

                if (!user) {
                    console.error("❌ user не найден");
                    return;
                }

                // Создаём голосование с этими данными
                new VotingSystem(this, playlistSelectorString, {
                    user,
                    eventUid,
                    tourUid,
                    voitedCount
                });
            },
            setTrack: (trackData) => {
                // Если trackData не указан — берём первый из плейлиста
                const targetTrack = trackData || tracks[0];
                if (!targetTrack) return;

                // Заполняем плеер данными
                self.setTrack(targetTrack);
            }
        };
    }

    _renderFolder(containerSelector, playlistName, tracks) {
        // Клонируем шаблон
        const template = document.getElementById('playlist-template');
        const clone = document.importNode(template.content, true);
        const playlistCard = $(clone);

        // Устанавливаем название
        playlistCard.find('.playlist-title').html(playlistName);

        // Жанр
        const genreEl = playlistCard.find('.playlist-genre');
        if (tracks.length && tracks[0].genre) {
            genreEl.text(tracks[0].genre);
        } else {
            genreEl.text('Разное');
        }

        // Обложка или фон
        const coverImg = playlistCard.find('.playlist-image');
        if (tracks[0]?.coverUrl) {
            coverImg.attr('src', tracks[0].coverUrl);
        } else {
            coverImg.remove();
            playlistCard.find('.playlist-cover').css('background-image', 'null');
        }

        // Подготовка списка треков
        const list = [];
        const tracksContainer = playlistCard.find('.playlist-tracks');
        const collapseBody = playlistCard.find('.accordion-body');

        // Видимые треки (до 4)
        const visibleTracks = tracks.slice(0, 4);
        const hiddenTracks = tracks.slice(4, 10); // максимум 10 треков

        // Функция создания элемента трека
        const createTrack = (track, index) => {
            const $track = this._createTrackElement(track, containerSelector, index);
            $track.find('.rating-container').text(track.duration);
            const $titleContainer = $track.closest('.marquee-container');
            $titleContainer
                .data('marquee-initialized', false)
                .marquee();
            list.push({ data: track, $el: $track });
            tracksContainer.append($track);
        };

        // Добавляем первые 4 трека
        visibleTracks.forEach((track, index) => {
            createTrack(track, index);
        });

        // Если есть скрытые треки — добавляем аккордион
        if (hiddenTracks.length > 0) {
            playlistCard.find('.playlist-footer').removeClass('d-none');
            hiddenTracks.forEach((track, index) => {
                createTrack(track, index + 4);
            });
        }

        // Сохраняем плейлист в this.playlists
        this.playlists[containerSelector] = {
            list,
            currentIndex: -1
        };

        // Добавляем готовую папку в DOM
        $(containerSelector).append(playlistCard);
    }


    // Клик по треку
    _onTrackClick(container, index) {
        if (this.mode === 'radio') {
            this.toggle('track');
        }

        const pl = this.playlists[container];
        if (!pl) {
            console.error('Плейлист не найден:', container);
            return;
        }

        // DOM-элемент трека
        const $track = $(`${container} .${this.trackClass}`).eq(index);
        if ($track.length === 0) {
            console.warn('Элемент трека отсутствует в DOM');
            return;
        }

        const offcanvasOpen = $(this.OFFCANVAS_SELECTOR).hasClass("show");

        const matchOffcanvas = {
            "#playlistOffcanvas": $track.closest("#playlistOffcanvas").length,
            "#playlist-offcanvas-list": $track.closest("#playlist-offcanvas-list").length,
            ".offcanvas-tracks-slice": $track.closest(".offcanvas-tracks-slice").length,
            ".offcanvas-custom-centered": $track.closest(".offcanvas-custom-centered").length,
            ".offcanvas": $track.closest(".offcanvas").length
        };

        const trackIndex = parseInt($track.attr('data-item-idx'), 10);
        if (isNaN(trackIndex)) {
            console.error('trackIndex не определён');
            return;
        }

        const trackData = pl.list[trackIndex]?.data;
        if (!trackData) {
            console.warn('Нет данных трека');
            return;
        }

        const currentlyPlaying = this._getCurrentTrackData();

        // ---------------------------------------------------------
        // 1. TOGGLE PLAY/PAUSE
        // ---------------------------------------------------------
        let isSameTrackPlaying =
            this.isPlaying && this.mode === 'track' &&
            currentlyPlaying &&
            currentlyPlaying.container === container &&
            currentlyPlaying.index === trackIndex &&
            currentlyPlaying.data.uid === trackData.uid;
        console.log([isSameTrackPlaying, currentlyPlaying.container, container, currentlyPlaying.index, trackIndex, currentlyPlaying.data.uid, trackData.uid])
        if (isSameTrackPlaying) {
            // !!! ИСПРАВЛЕНИЕ 1: Показываем плеер, даже если трек тот же (на случай, если плеер был закрыт)
            this.show();

            if (this.audioTrack.paused) {
                this.audioTrack.play().catch(()=>{});
            } else {
                this.audioTrack.pause();
                this._sendEventToServer("track_pause",{});
            }
            return;
        }

        // ---------------------------------------------------------
        // 2. ЛОГИКА ДЛЯ SHUFFLE MODE
        // ---------------------------------------------------------
        if (this.shuffleMode === 'shuffle-on') {

            const globalPl = this.playlists[this.GLOBAL_SHUFFLE_KEY];
            if (!globalPl) {
                console.warn('Глобальный shuffle плейлист не найден, переходим в обычный режим');
                // Нет return, позволяем коду упасть в обычный режим (пункт 3)
            } else {

                const clickedUid = trackData.uid;
                const isOffcanvasClick = offcanvasOpen && Object.values(matchOffcanvas).some(val => val > 0);

                // ищем реальный индекс трека в глобальном плейлисте
                const globalIndex = globalPl.list.findIndex(t => t.data.uid === clickedUid);

                // !!! ИСПРАВЛЕНИЕ 2: Если трек не найден в Shuffle пуле, не выходим молча, а играем как обычно
                if (globalIndex === -1) {
                    console.warn('Трек не найден внутри глобального плейлиста, воспроизведение в обычном режиме');
                    // Нет return, идем дальше к пункту 3
                } else {
                    // Трек найден в глобальном шафле

                    // если клик ВНУТРИ Offcanvas — НЕ ПЕРЕСТРАИВАЕМ SHUFFLE !!!
                    if (isOffcanvasClick) {
                        const shuffledIndex = globalPl.shuffledList.indexOf(globalIndex);
                        if (shuffledIndex !== -1) {
                            globalPl.currentIndex = globalIndex;
                            globalPl.shuffledCurrentIndex = shuffledIndex;
                            this.currentPlaylist = this.GLOBAL_SHUFFLE_KEY;

                            this.show();
                            this._playTrackByIndex(this.GLOBAL_SHUFFLE_KEY, globalIndex);
                            return;
                        }
                    }

                    // КЛИК СНАРУЖИ OFFCANVAS
                    this._shufflePlaylistInternal(this.GLOBAL_SHUFFLE_KEY);

                    const newPos = globalPl.shuffledList.indexOf(globalIndex);
                    if (newPos !== -1) {
                        globalPl.shuffledList.splice(newPos, 1);
                    }
                    globalPl.shuffledList.unshift(globalIndex);
                    globalPl.shuffledCurrentIndex = 0;
                    globalPl.currentIndex = globalIndex;

                    this.currentPlaylist = this.GLOBAL_SHUFFLE_KEY;

                    this.show();
                    this._playTrackByIndex(this.GLOBAL_SHUFFLE_KEY, globalIndex);

                    if ($(this.OFFCANVAS_SELECTOR).hasClass('show')) {
                        this.renderOffcanvasFromPlaylist(
                            this.OFFCANVAS_LIST_SELECTOR,
                            this.GLOBAL_SHUFFLE_KEY
                        );
                    }
                    return;
                }
            }
        }

        // ---------------------------------------------------------
        // 3. ОБЫЧНЫЙ НЕ-SHUFFLE РЕЖИМ
        // ---------------------------------------------------------
        this.currentPlaylist = container;
        pl.currentIndex = trackIndex;

        this.show();
        this._playTrackByIndex(container, trackIndex);
    }


    _playTrackByIndex2(containerSelector, index) {
        const pl = this.playlists[containerSelector];
        if (!pl) return;

        const { list } = pl;

        this._deactivateAll()

        this.pureListeningTime = 0; // Обнуляем чистое время прослушивания
        this.lastUpdateTime = 0;    // Обнуляем время последнего обновления
        this.listeningEventSentForCurrentTrack = false;

        // Получаем данные трека
        const trackData = list[index].data;
        const $track = $(`${containerSelector} .${this.trackClass}`).eq(index);
        const savedTime = this._toSeconds(trackData.duration_played || '00:00:00');

        // Назначаем активный класс и удаляем hidden-progress
        $track.addClass('active').find('.progress-bar-container').removeClass('hidden-progress');
        //$track.find('.fa-play').removeClass('fa-play').addClass('fa-stop');
        const $playOverlay = $track.find('.play-overlay');
        $playOverlay.find('i.fas').addClass('d-none'); // скрываем .fa-play
        $playOverlay.find('.audio-wave').removeClass('d-none');
        this.playerElement.find('.fa-play').removeClass('fa-play').addClass('fa-stop');

        // Обновляем индекс текущего трека
        pl.currentIndex = index;

        // Проверяем наличие trackUrl или trackLink
        const trackUrl = `/track/${trackData.uid}`;
        if (!trackUrl) {
            console.error('Ошибка: Поле trackUrl или trackLink отсутствует в данных трека.');
            return;
        }

        try {
            // Запускаем воспроизведение трека
            this.audioTrack.src = trackUrl;
            this.audioTrack.playbackRate = this.playbackRate;
            console.log('track play with '+this.playbackRate)
            this.audioTrack.addEventListener('loadedmetadata', () => {
                /*if (!isNaN(savedTime) && savedTime > 0) {
					this.audioTrack.currentTime = savedTime;
				}
				this.audioTrack.play().then(() => {
					this.isPlaying = true;
					this.showCover({ ...trackData, currentState: this._toTimecode(savedTime, 3) }, 3290);
				}).catch(err => {
					console.error('Ошибка воспроизведения:', err);
					this.isPlaying = false;
				});*/

                this.audioTrack.currentTime = 0; // Всегда начинаем с начала
                this.audioTrack.play().then(() => {
                    this.isPlaying = true;
                    this.showCover({ ...trackData, currentState: "00:00:00" }, 3290); // Обновляем обложку, указывая 00:00:00
                }).catch(err => {
                    console.error('Ошибка воспроизведения:', err);
                    this.isPlaying = false;
                });
            }, { once: true });

            this.audioTrack.currentTime = 0;
            this.audioTrack.play().then(() => {
                this.isPlaying = true;
                this.showCover({ ...trackData, currentState: "00:00:00" }, 3290);
            }).catch(err => {
                console.error('Ошибка воспроизведения:', err);
                this.isPlaying = false;
            });

            /*this._sendEventToServer("track_play", {
				uid: trackData.uid,
				title: trackData.title,
				artist: trackData.artist,
				duration_played: "00:00:00",
				duration: trackData.duration,
				source: "track"
			});*/

            // Расчет дельты времени для чистого прослушивания
            const now = Date.now() / 1000; // Текущее время в секундах
            if (this.lastUpdateTime === 0) {
                this.lastUpdateTime = now; // Инициализация при первом обновлении
            }
            const deltaTime = now - this.lastUpdateTime;
            this.lastUpdateTime = now; // Обновление времени последнего обновления

            // Накапливаем pureListeningTime только если трек играет и не происходит перемотка
            if (!this.audioTrack.paused && !this.audioTrack.seeking) {
                this.pureListeningTime += deltaTime;
            }


            this.audioTrack.ontimeupdate = () => {
                const currentTime = this.audioTrack.currentTime;
                const percent = (currentTime / this.audioTrack.duration) * 100;
                const timecode = this._toTimecode(currentTime, 3);

                list[index].data.duration_played = timecode;
                $track.find('.progress-bar-container .progress-bar').css('width', `${percent}%`);
                $track.find('.duration-from').text(timecode);
                $track.attr('data-duration_played', timecode);

                $('.now-playing').attr('data-duration_played', timecode);
                $('.now-playing .elapsed-time').text(timecode);

                if (!this.audioTrack.muted && this.pureListeningTime > this.timeListening && !this.listeningEventSentForCurrentTrack) {
                    //console.log([dur, this._toTimecode(dur, 3)])
                    this._sendEventToServer("track_listening", {
                        uid: trackData.uid,
                        title: trackData.title,
                        artist: trackData.artist,
                        duration_played: this._toTimecode(this.pureListeningTime, 3),
                        duration: timecode,
                        source: this.mode
                    });
                    this.listeningEventSentForCurrentTrack = true; // Установить флаг, чтобы не отправлять повторно
                }
            };

            if (pl.onPlayCallback) {
                pl.onPlayCallback(trackData);
            }
        } catch (error) {
            console.error('Ошибка воспроизведения:', error);
            this.isPlaying = false; // Сбрасываем флаг при ошибке
        }
    }


    _playTrackByIndex(containerSelector, index) {
        const pl = this.playlists[containerSelector];
        if (!pl || index < 0 || index >= pl.list.length) {
            console.error(`Плейлист ${containerSelector} не найден или индекс ${index} некорректен.`);
            // !!! ИСПРАВЛЕНИЕ 3: Заменили this._onPauseUI() на this.audioTrack.pause(), так как метода this._onPauseUI() не существует
            if (this.audioTrack && !this.audioTrack.paused) {
                this.audioTrack.pause();
            }
            return;
        }

        const { list } = pl;
        const newTrackData = list[index].data;
        const oldTrackData = this.currentTrack;

        // --- 1. ДЕАКТИВАЦИЯ СТАРОГО ТРЕКА ---
        if (oldTrackData) {
            const $oldTrackEl = this._findTrackElementByUid(oldTrackData.uid);
            if ($oldTrackEl?.length) {
                $oldTrackEl.removeClass('active');
                $oldTrackEl.find('.play-overlay .audio-wave').addClass('d-none');
                $oldTrackEl.find('.play-overlay i.fa-play').removeClass('d-none');
                $oldTrackEl.attr('data-duration_played', '00:00:00');
            }
        }

        this._deactivateAll();

        // --- 2. СБРОС СЧЁТЧИКОВ ---
        this.pureListeningTime = 0;
        this.lastUpdateTime = 0;
        this.listeningEventSentForCurrentTrack = false;

        // --- 3. УСТАНОВКА ТРЕКА ---
        this.currentTrack = newTrackData;
        const $newTrack = this._findTrackElementByUid(newTrackData.uid);
        const savedTime = this._toSeconds(newTrackData.duration_played || "00:00:00");

        if (this.playerElement) {
            this.playerElement.addClass('controls-loading');
        }

        // !!! ИСПРАВЛЕНИЕ 4: Сразу обновляем UI плеера (обложка, название), чтобы пользователь видел реакцию
        const initTime = savedTime > 0 ? this._toTimecode(savedTime, 3) : "00:00:00";
        this.showCover({ ...newTrackData, currentState: initTime }, 3290);

        if (!this.audioTrack.paused) this.audioTrack.pause();

        if (typeof this.trackInfoCallback === 'function') {
            this.trackInfoCallback(newTrackData.uid, (data) => {
                this._updateLikeAndFavButtons(data);
            });
        }

        this.currentPlaylist = containerSelector;
        pl.currentIndex = index;

        const trackUrl = `/track/${newTrackData.uid}`;

        try {
            this.audioTrack.src = trackUrl;
            this.audioTrack.playbackRate = this.playbackRate;
            this.audioTrack.load();

            this.isPlaying = true;

            // === 7. SAFE CANPLAY PROMISE (Improved) ===
            const canPlayPromise = new Promise((resolve, reject) => {
                const cleanup = () => {
                    this.audioTrack.removeEventListener('canplay', onCanPlay);
                    this.audioTrack.removeEventListener('error', onError);
                };

                const onCanPlay = () => {
                    cleanup();
                    resolve();
                };

                const onError = (e) => {
                    cleanup();
                    reject(e);
                };

                this.audioTrack.addEventListener('canplay', onCanPlay);
                this.audioTrack.addEventListener('error', onError);

                if (this.audioTrack.readyState >= 3) {
                    cleanup();
                    resolve();
                }
            });

            canPlayPromise
                .then(() => {
                    if (this.playerElement) {
                        this.playerElement.removeClass('controls-loading');
                    }
                    if (this.isPlaying) {
                        // Пробуем воспроизвести
                        return this.audioTrack.play();
                    }
                })
                .then(() => {
                    // Успешный старт
                    if ($newTrack?.length) {
                        $newTrack.addClass('active');
                        $newTrack.find('.play-overlay .audio-wave').removeClass('d-none');
                        $newTrack.find('.play-overlay i.fa-play').addClass('d-none');
                    }
                    if (this.playerElement) {
                        this.playerElement.find('[data-action="play-pause"] i')
                            .removeClass('fa-play fa-pause')
                            .addClass('fa-pause');
                    }
                })
                .catch(err => {
                    console.error(`[PLAY_DEBUG] Ошибка воспроизведения или загрузки:`, err);

                    // Если ошибка загрузки, сбрасываем UI
                    if ($newTrack?.length) {
                        this._deactivateAll();
                        $newTrack.removeClass('active');
                        $newTrack.find('.play-overlay .audio-wave').addClass('d-none');
                        $newTrack.find('.play-overlay i.fa-play').removeClass('d-none');
                    }

                    this.isPlaying = false;
                    if (this.playerElement) {
                        this.playerElement.removeClass('controls-loading');
                        // Возвращаем иконку Play, так как не заиграло
                        this.playerElement.find('[data-action="play-pause"] i')
                            .removeClass('fa-pause')
                            .addClass('fa-play');
                    }
                });

        } catch (error) {
            console.error('Ошибка playTrack:', error);
            if ($newTrack?.length) {
                $newTrack.removeClass('active');
            }
            this.isPlaying = false;
            if (this.playerElement) {
                this.playerElement.removeClass('controls-loading');
            }
        }
    }



    _deactivateAll() {
        $(`${this.OFFCANVAS_SELECTOR} .${this.trackClass}`).removeClass('active');

        $(`body .${this.trackClass}`).removeClass('active');
        //find('.progress-bar-container').addClass('hidden-progress').end()

        $('.fa-play').removeClass('d-none');
        $('.audio-wave').removeClass('d-none').addClass('d-none');

        if(this.playerElement) {
            this.playerElement.find('.fa-pause').removeClass('fa-pause').addClass('fa-play');
        }
    }

    _getRandomTrackGlobal() {
        const containers = Object.keys(this.playlists);
        if (containers.length === 0) return null;

        // Случайный плейлист
        const randomContainer = containers[Math.floor(Math.random() * containers.length)];
        const pl = this.playlists[randomContainer];
        if (!pl || !pl.list.length) return null;

        // Случайный трек в этом плейлисте
        const randomIndex = Math.floor(Math.random() * pl.list.length);

        return { container: randomContainer, index: randomIndex };
    }



    _onTrackEnd() {
        // Чтобы не сработало, если трек ещё не доиграл до конца (например, перемотка)
        if (this.audioTrack.currentTime < this.audioTrack.duration - 2) {
            return;
        }

        // repeat-one → перезапускаем текущий трек с 0
        if (this.repeatMode === 'repeat-one') {
            this.audioTrack.currentTime = 0;

            const pl = this.playlists[this.currentPlaylist];
            if (pl && pl.currentIndex !== undefined) {
                const trackData = pl.list[pl.currentIndex]?.data;
                if (trackData) {
                    trackData.duration_played = "00:00:00"; // сброс прогресса
                }
            }

            console.log("Repeat-one: restarting same track");
            this.audioTrack.play();
            return;
        }

        // во всех остальных случаях → полностью доверяем nextTrack
        this.isPlaying = false;
        this.nextTrack(this.currentPlaylist);
    }

    _findTrackElementByUid(trackUid) {
        if (!trackUid) return null;

        // Перебираем все ВИДИМЫЕ плейлисты
        for (const container in this.playlists) {
            // Игнорируем невидимый глобальный пул
            if (container === this.GLOBAL_SHUFFLE_KEY) continue;

            const pl = this.playlists[container];
            if (pl && pl.list) {
                const foundItem = pl.list.find(item => item.data?.uid === trackUid);
                // Возвращаем реальный jQuery-элемент, если найден
                if (foundItem && foundItem.$el && foundItem.$el.length) {
                    return foundItem.$el;
                }
            }
        }
        return null;
    }


    nextTrack(container) {
        let pl = this.playlists[container]; // Текущий плейлист
        let nextIndexToPlay = -1;
        let targetContainer = container; // Контейнер, из которого будет взят трек

        // --- 1. ПЕРЕХВАТ: True Global Shuffle ---
        if (this.shuffleMode === 'shuffle-on') {
            const globalPl = this.playlists[this.GLOBAL_SHUFFLE_KEY];
            if (globalPl && globalPl.shuffledList && globalPl.shuffledList.length > 0) {

                // Если текущий трек не в глобальном плейлисте (например, только что нажали "Play" на локальном треке),
                // синхронизируем индекс текущего трека в глобальном плейлисте.
                if (pl.container !== this.GLOBAL_SHUFFLE_KEY) {
                    const currentTrackUid = this.currentTrack?.uid;
                    if (currentTrackUid) {
                        const currentTrackIndexInGlobal = globalPl.list.findIndex(t => t.data.uid === currentTrackUid);
                        if (currentTrackIndexInGlobal !== -1) {
                            globalPl.currentIndex = currentTrackIndexInGlobal;
                            globalPl.shuffledCurrentIndex = globalPl.shuffledList.indexOf(currentTrackIndexInGlobal);
                        } else {
                            globalPl.shuffledCurrentIndex = 0; // Начинаем с начала шафла
                        }
                    }
                }

                // Переходим к следующему треку в перемешанном списке
                targetContainer = this.GLOBAL_SHUFFLE_KEY;
                pl = globalPl;
                this.currentPlaylist = this.GLOBAL_SHUFFLE_KEY;

                // Если shuffledCurrentIndex не установлен (может случиться при первом запуске шафла)
                if (pl.shuffledCurrentIndex === -1 || pl.shuffledList[pl.shuffledCurrentIndex] !== pl.currentIndex) {
                    // Пытаемся найти текущий трек в перемешанном списке
                    pl.shuffledCurrentIndex = pl.shuffledList.indexOf(pl.currentIndex);
                    if (pl.shuffledCurrentIndex === -1) pl.shuffledCurrentIndex = 0;
                }

                pl.shuffledCurrentIndex = this._getNextCyclicIndex(pl.shuffledCurrentIndex, pl.shuffledList.length);
                nextIndexToPlay = pl.shuffledList[pl.shuffledCurrentIndex];

                console.log(`True Global Shuffle: Next track (shuffled index ${pl.shuffledCurrentIndex}): original index ${nextIndexToPlay}`);

                // Переходим к шагу 4 (Запуск воспроизведения)
                return this._processNextTrackPlay(targetContainer, pl, nextIndexToPlay);
            }
        }

        // --- 2. Логика режима повтора/обычного порядка (для локальных плейлистов) ---
        // Если глобальный шафл выключен или не готов, используем текущий плейлист.
        if (!pl || !pl.list || pl.list.length === 0) {
            console.log(`Плейлист ${container} пуст или не найден.`);
            return;
        }

        if (this.repeatMode === 'repeat-one') {
            nextIndexToPlay = pl.currentIndex; // Повторяем текущий трек
            console.log(`Repeat Mode: repeat-one. Playing current track index: ${nextIndexToPlay}`);
        } else if (this.repeatMode === 'repeat-all') {
            if (pl.currentIndex >= pl.list.length - 1) {
                nextIndexToPlay = 0;
                console.log(`Repeat Mode: repeat-all. Reached end, going to first track: ${nextIndexToPlay}`);
            } else {
                nextIndexToPlay = pl.currentIndex + 1; // Иначе просто следующий
                console.log(`Repeat Mode: repeat-all (not end). Playing next sequential track: ${nextIndexToPlay}`);
            }
        } else { // repeatMode === 'repeat-off'
            if (this.shuffleMode === 'shuffle-reverse') {
                // --- Чистый reverse внутри текущего плейлиста ---
                nextIndexToPlay = pl.currentIndex - 1;
                if (nextIndexToPlay < 0) {
                    nextIndexToPlay = pl.list.length - 1;
                }
                console.log(`Shuffle Mode: shuffle-reverse. Playing previous track: ${nextIndexToPlay}`);
            } else {
                // --- Обычный порядок ---
                nextIndexToPlay = pl.currentIndex + 1;
                console.log(`Shuffle Mode: shuffle-off. Playing next sequential track: ${nextIndexToPlay}`);
            }
        }

        // --- 3. Обработка перехода на следующий плейлист ---
        if (this.repeatMode !== 'repeat-one' && nextIndexToPlay >= pl.list.length) {
            if (Object.keys(this.playlists).length === 1 && this.playlisttoggle) {
                nextIndexToPlay = 0;
                console.log(`Reached end of single playlist, playlisttoggle true. Looping to first track: ${nextIndexToPlay}`);
            } else if (this.playlisttoggle && Object.keys(this.playlists).length > 1) {
                const containers = Object.keys(this.playlists).filter(c => c !== this.GLOBAL_SHUFFLE_KEY); // Игнорируем глобальный пул
                const currentIndex = containers.indexOf(container);
                const nextContainerIndex = (currentIndex + 1) % containers.length;
                const nextContainer = containers[nextContainerIndex];

                const nextPl = this.playlists[nextContainer];
                if (nextPl?.list?.length > 0) {
                    this.currentPlaylist = nextContainer;
                    $('.now-playing').attr('data-track-duration_played', '00:00:00');
                    console.log(`Moving to next playlist: ${nextContainer}, playing first track.`);
                    this._playTrackByIndex(nextContainer, 0); // Играем первый трек следующего плейлиста
                    return;
                } else {
                    console.log('Нет следующего трека в текущем плейлисте и не переключаемся на следующий плейлист.');
                    this._onPauseUI();
                    return;
                }
            } else {
                console.log('Нет следующего трека в текущем плейлисте и не переключаемся на следующий плейлист.');
                this._onPauseUI();
                return;
            }
        } else if (nextIndexToPlay === -1) {
            console.error('Не удалось определить следующий трек.');
            this._onPauseUI();
            return;
        }

        // --- 4. Запуск воспроизведения (для локальных плейлистов) ---
        return this._processNextTrackPlay(container, pl, nextIndexToPlay);
    }

    _processNextTrackPlay(container, pl, nextIndexToPlay) {
        if (nextIndexToPlay === undefined || nextIndexToPlay >= pl.list.length) {
            console.warn(`Некорректный индекс следующего трека (${nextIndexToPlay}) или его отсутствие.`);
            this._onPauseUI();
            return;
        }

        const currentTrack = this.currentTrack;
        const nextTrackData = pl.list[nextIndexToPlay]?.data;

        if (!nextTrackData) {
            console.warn(`Данные следующего трека (индекс ${nextIndexToPlay}) отсутствуют.`);
            this._onPauseUI();
            return;
        }

        if (this.repeatMode !== 'repeat-one' && currentTrack) {
            this._sendEventToServer("track_next", {
                uid: currentTrack.uid,
                title: currentTrack.title,
                artist: currentTrack.artist,
                // ИСПРАВЛЕНИЕ: Используем глобальный плеер для получения продолжительности
                duration_played: $('.now-playing').attr('data-track-duration_played') || '00:00:00',
                duration: currentTrack.duration,
                source: "track"
            });
        }

        $('.now-playing').attr('data-track-duration_played', '00:00:00');
        // Используем container, который может быть this.GLOBAL_SHUFFLE_KEY
        this._playTrackByIndex(container, nextIndexToPlay);
        this.showCover(nextTrackData);
    }

    prevTrack(container) {
        if (this.mode === 'radio') return;

        let pl = this.playlists[container];
        if (!pl || !pl.list || pl.list.length === 0) return;

        let prev = pl.currentIndex - 1;
        let targetContainer = container;

        // --- 1. ПЕРЕХВАТ: True Global Shuffle (Назад) ---
        if (this.shuffleMode === 'shuffle-on' && pl.container === this.GLOBAL_SHUFFLE_KEY) {

            if (pl.shuffledList && pl.shuffledList.length > 0) {
                // Убеждаемся, что shuffledCurrentIndex синхронизирован
                if (pl.shuffledCurrentIndex === -1 || pl.shuffledList[pl.shuffledCurrentIndex] !== pl.currentIndex) {
                    pl.shuffledCurrentIndex = pl.shuffledList.indexOf(pl.currentIndex);
                    if (pl.shuffledCurrentIndex === -1) pl.shuffledCurrentIndex = 0;
                }

                let prevShuffledIndex = pl.shuffledCurrentIndex - 1;
                if (prevShuffledIndex < 0) {
                    prevShuffledIndex = pl.shuffledList.length - 1; // Зацикливание
                }
                pl.shuffledCurrentIndex = prevShuffledIndex;
                prev = pl.shuffledList[pl.shuffledCurrentIndex];

                console.log(`True Global Shuffle (Prev): Shuffled index ${pl.shuffledCurrentIndex} -> original index ${prev}`);
                targetContainer = this.GLOBAL_SHUFFLE_KEY; // Всегда используем глобальный контейнер
            } else {
                // Fallback, если список шафла пуст/не готов
                prev = pl.currentIndex - 1;
            }
        } else {
            // СТАРАЯ ЛОГИКА: Обычный/Локальный переход назад
            prev = pl.currentIndex - 1;
        }

        // --- 2. Обработка зацикливания/перехода на предыдущий плейлист ---
        if (prev < 0) {
            // Если только один плейлист — зацикливаем назад
            if (Object.keys(this.playlists).length === 1 && this.playlisttoggle) {
                prev = pl.list.length - 1; // последний трек
            } else if (this.playlisttoggle && Object.keys(this.playlists).length > 1) {
                // Переход к предыдущему плейлисту
                const containers = Object.keys(this.playlists).filter(c => c !== this.GLOBAL_SHUFFLE_KEY);
                const currentIndex = containers.indexOf(container);
                const prevContainerIndex = (currentIndex - 1 + containers.length) % containers.length;
                const prevContainer = containers[prevContainerIndex];

                const prevPl = this.playlists[prevContainer];
                if (prevPl?.list?.length > 0) {
                    const lastIdx = prevPl.list.length - 1;
                    this.currentPlaylist = prevContainer;
                    this._playTrackByIndex(prevContainer, lastIdx);
                    return; // Выходим после перехода на другой плейлист
                }
            } else {
                console.warn('Нет предыдущего трека и плейлистов больше нет');
                return;
            }
        }

        // --- 3. Запуск воспроизведения ---
        pl = this.playlists[targetContainer]; // Обновляем pl, если контейнер поменялся (при шафле)
        const currentTrack = this.currentTrack; // Используем this.currentTrack для события
        const prevTrackData = pl.list[prev]?.data; // Получаем данные предыдущего трека

        if (!currentTrack || !prevTrackData) {
            console.warn('Данные трека отсутствуют');
            return;
        }

        this._sendEventToServer("track_prev", {
            uid: currentTrack.uid,
            title: currentTrack.title,
            artist: currentTrack.artist,
            // ИСПРАВЛЕНИЕ: Используем глобальный плеер для получения продолжительности
            duration_played: $('.now-playing').attr('data-track-duration_played') || '00:00:00',
            duration: currentTrack.duration,
            source: "track"
        });

        this._playTrackByIndex(targetContainer, prev); // Используем targetContainer и индекс
    }

    _getPreviousTrackIndex(pl) {
        let newIndex = pl.currentIndex;

        if (this.orderMode === 'shuffle' && pl.shuffleHistory && pl.shuffleHistory.length > 1) {
            // Режим Shuffle: берем предпоследний элемент из истории и удаляем его
            pl.shuffleHistory.pop(); // Удаляем текущий трек
            newIndex = pl.shuffleHistory[pl.shuffleHistory.length - 1]; // Получаем предыдущий
        } else if (this.orderMode === 'normal') {
            // Режим Normal: обычный переход назад
            newIndex = (pl.currentIndex - 1 + pl.list.length) % pl.list.length;
        } else {
            // В режиме shuffle, если истории нет, просто переходим к предыдущему (как в normal)
            newIndex = (pl.currentIndex - 1 + pl.list.length) % pl.list.length;
        }
        return newIndex;
    }

    // Переключение режимов
    toggle(mode) {
        if (mode === this.mode) return;

        const previousMode = this.mode;

        this.mode = mode;

        if (mode === 'radio') {
            $('body').removeClass('radio track').addClass('radio');

            this.audioTrack.pause();

            this._sendEventToServer("radio_start", {
                uid: $('.now-playing').attr('data-uid'),
                title: $('.now-playing').attr('data-title'),
                artist: $('.now-playing').attr('data-artist'),
                duration_played: $('.now-playing').attr('data-duration_played'),
                duration: $('.now-playing').attr('data-duration'),
                source: 'track'
            });

            // Сброс буфера и быстрая загрузка
            this.audioRadio.preload = 'auto';
            this.audioRadio.load();
            this.audioRadio.addEventListener('canplay', () => {
                this.audioRadio.play();
            }, { once: true });

            this._deactivateAll();
            this.soundOff(false);
            this.controllersOff(true)
            $('')
        } else {
            /*if (this.socket) {
				this.socket.close();
				this.socket = null;
			}*/

            $('body').removeClass('radio track').addClass('track');

            this.controllersOff(false)

            this.audioRadio.pause();
            this.showCover(this._firstTrack(), 3509)
            this._sendEventToServer("radio_stop", {
                uid: this.currentStreamData?.uid,
                duration_played: this.currentStreamData?.currentState,
                duration: this.currentStreamData?.duration,
                title: this.currentStreamData?.title,
                artist: this.currentStreamData?.artist,
                source: "radio"
            });
        }

        $(document).trigger('modeChanged', { previousMode, currentMode: this.mode });

        this.isPlaying = false;
    }

    // WebSocket-логика
    _initSocket(container) {
        // Если WebSocket уже открыт, ничего не делаем
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log(`${moment().subtract(3, 'hours').format('DD.MM.YYYY HH:mm:ss')} :: WebSocket уже открыт.`);
            return;
        }

        // Если WebSocket существует, но закрыт, закрываем его явно
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        // Создаем новое WebSocket-соединение
        this.socket = new WebSocket(this.websocketUrl);

        // Обработчик успешного открытия соединения
        this.socket.onopen = () => {
            console.log(`${moment().subtract(3, 'hours').format('DD.MM.YYYY HH:mm:ss')} :: WebSocket подключен для плейлиста: ${container}`);
        };

        // Обработчик получения сообщений
        this.socket.onmessage = ({ data }) => {
            try {
                const msg = JSON.parse(data);
                const pl = this.playlists[container];

                const previousTrack = this.currentStreamData;
                this.currentStreamData = msg;

                if (msg.event === 'track_start') {
                    if (this.mode === "radio") {
                        if (!previousTrack || previousTrack.uid !== msg.uid) {
                            this._sendEventToServer("radio_track_change", {
                                uid: previousTrack.uid,
                                title: previousTrack.title,
                                artist: previousTrack.artist,
                                duration_played: previousTrack.currentState,
                                duration: previousTrack.duration,
                                source: "radio"
                            });
                            //deleteCookie('authToken');
                            //location.reload(true);
                        }

                        this.showCover(msg);

                        if (pl && pl.onPlayCallback) {
                            pl.onPlayCallback(msg);
                        }
                    }
                    $.getJSON(`/api/track-history/0`).done(historyArray => {
                        const fltSuccess = historyArray.filter(track => track.status === 'successful');
                        this._refreshPlaylist(container, fltSuccess);

                        const fltInprogress = historyArray.filter(track => (track.status == 'pending' || track.status == 'waiting') || (track.status === 'new' && track.isRequest === 1));

                        updateSoonTracks(fltInprogress)
                        reindexPlaylist('.soon-track', 'track-card-small');
                    });
                }
                if (msg.event === 'track_update') {
                    if (this.mode === "radio") {
                        this.showCover(msg);

                        const pos = this._toSeconds(msg.currentState);
                        const dur = this._toSeconds(msg.duration);
                        this._updateCoverProgress(pos, dur);
                        $('.now-playing .elapsed-time').text(this._toTimecode(pos, 3));

                        // === ЗАПРОС ДОП. ДАННЫХ ТОЛЬКО ПРИ СМЕНЕ ТРЕКА ===
                        if (msg.uid && msg.uid !== this._lastRadioTrackInfoUid) {
                            this._lastRadioTrackInfoUid = msg.uid; // запоминаем UID

                            if (typeof this.trackInfoCallback === 'function') {
                                this.trackInfoCallback(msg.uid, (infoData) => {
                                    // Обновляем данные в currentStreamData
                                    this.currentStreamData = { ...this.currentStreamData, ...infoData };
                                    // Принудительно обновляем UI
                                    this.showCover(this.currentStreamData, 0);
                                    this._updateLikeAndFavButtons(infoData);
                                });
                            }
                        }

                        /*if (pl && pl.onPlayCallback) {
							pl.onPlayCallback(msg);
						}

						const pos = this._toSeconds(msg.currentState);
						const dur = this._toSeconds(msg.duration)

						this._updateCoverProgress(pos, dur);
						$('.now-playing .elapsed-time').text(this._toTimecode(pos, 3))*/
                    }
                }
                if (msg.event === 'track_requested') {
                    $.getJSON(`/api/track-history/0`).done(historyArray => {
                        const fltSuccess = historyArray.filter(track => track.status === 'successful');
                        this._refreshPlaylist(container, fltSuccess);

                        const fltInprogress = historyArray.filter(track => (track.status == 'pending' || track.status == 'waiting') || (track.status === 'new' && track.isRequest === 1));

                        updateSoonTracks(fltInprogress)
                        reindexPlaylist('.soon-track', 'track-card-small');
                    });
                }
            } catch (error) {
                console.error('Ошибка при обработке WebSocket сообщения:', error);
            }
        };

        // Обработчик ошибок
        this.socket.onerror = (error) => {
            console.error(`Ошибка WebSocket для плейлиста ${container}:`, error);
            this._reconnectWebSocket(container); // Попытка переподключения
        };

        // Обработчик закрытия соединения
        this.socket.onclose = () => {
            console.log(`${moment().subtract(3, 'hours').format('DD.MM.YYYY HH:mm:ss')} :: WebSocket отключен для плейлиста: ${container}`);
            this._reconnectWebSocket(container); // Попытка переподключения
        };
    }

    _reconnectWebSocket(container) {
        console.log(`${moment().subtract(3, 'hours').format('DD.MM.YYYY HH:mm:ss')} :: Попытка переподключения WebSocket для плейлиста: ${container}...`);
        setTimeout(() => {
            this._initSocket(container);
        }, 5000);
    }

    _refreshPlaylist(containerSelector, historyArray) {
        const pl = this.playlists[containerSelector];
        if (!pl) return;

        const existingQueueUids = new Set(pl.list.map(item => item.data.queueUid));
        const newItems = historyArray
            .filter(h => !existingQueueUids.has(h.queueUid))
            .map((h, index) => {

                const $trk = this._createTrackElement(h, containerSelector, index);
                if(h.isRequest === 1) {
                    const $reqLabel = $(`
						<div class="absolute top-[10px] right-[10px] bg-orange-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm z-10">
							Request
						</div>
					`);

                    $trk.append($reqLabel);
                }
                $(containerSelector).prepend($trk);
                return { data: h, $el: $trk };
            });


        if (newItems.length) {
            pl.list = newItems.concat(pl.list);

            if (pl.list.length > pl.list.length) {
                const removedTrack = pl.list.pop();
                removedTrack.$el.remove();
            }

            this._updateTrackIndexes(containerSelector);

            pl.currentIndex = 0;
        }

        // Вызываем коллбэк, если он установлен

        if (this.isPlaying === false && pl.onUpdateCallback) {
            pl.onUpdateCallback(pl.list[0].data);
        }
    }

    _createTrackElement(data, containerSelector, index, isChecked = false) {
        const $trk = $($('#track-template').html());
        $trk.addClass(this.trackClass)
            .attr('data-playlist', containerSelector)
            .attr('data-item-idx', index);

        // Обязательные поля
        $trk.find('.cover-image').attr('src', `/cover/${data.uid}?width=360&ts=${Date.now()}`);
        $trk.find('.track-title').text(this._capitalize(data.title)).attr("href", `/song/${data.uid}`);
        $trk.find('.track-artist')
            .text(data.artist)
            .attr('data-artist-id', data.artist_id)
            .attr('href', `/author/${data.name}`);
        $trk.find('.year-input').val(data.year || '');
        $trk.find('.genre-text').text(data.genre || 'another');

        $trk.find('.track-genres').text(data.genre || 'another');
        $trk.find('.track-info').attr('data-duration', data.duration);

        // Добавляем данные в атрибуты
        Object.keys(data).forEach(k => $trk.attr(`data-${k}`, data[k]));

        const dataDraggable = data.draggable || false;

        if (data.draggable) {
            $trk.attr('data-is-draggable', true);
            $trk.attr('draggable', true);
            $trk.addClass('track-draggable');
        }

        if(isChecked) {
            const dataSelected = data.selected || false;

            $trk.find('.field-item').removeClass('w-100');

            const $extraInfo = $(`
				<div class="track-extra">
					<div class="track-duration">
						<span>${data.duration || '00:00'}</span>
					</div>
					<div class="track-select" 
						data-checked="${dataSelected ? 1 : 0}" 
						title="Добавить в плейлист">
						<i class="fa-solid ${dataSelected ? 'fa-check' : 'fa-plus'}"></i>
					</div>
				</div>
			`);
            $trk.append($extraInfo);

            $extraInfo.find('.track-select').on('click', function (e) {
                e.stopPropagation();
                const $btn = $(this);
                const checked = $btn.attr('data-checked') === '1';
                $btn.attr('data-checked', checked ? 0 : 1);
                $btn.find('i')
                    .toggleClass('fa-plus', checked)
                    .toggleClass('fa-check', !checked);

                // триггерим кастомное событие для внешней логики PlaylistManager
                $trk.trigger('trackSelectToggled', {
                    uid: data.uid,
                    selected: !checked
                });
            });
        }

        const tags = (data.tags || []).join(', ');
        $trk.find('.tag-list').html(tags.split(', ').map(tag =>
            `<span class="badge bg-secondary me-1">${tag} <i class="fas fa-times ms-1"></i></span>`
        ).join(''));

        // Продолжительность
        $trk.find('.duration-to').text(this._toTimecode(this._toSeconds(data.duration, 3)));

        // Дополнительные поля
        if (data.dateEnded !== undefined) {
            const localTime = moment.utc(data.dateEnded).tz("Europe/Moscow");
            const datequeued = localTime.format("HH:mm:ss");

            $trk.find(".track-archive").attr("data-queued", datequeued).removeClass("active").addClass("active");
        }

        if (data.trackdatecreated !== undefined) {
            const publishdate = moment.utc(data.trackdatecreated).tz("Europe/Moscow");
            const formatdate = publishdate.format("DD.MM.yyyy");

            $trk.find(".track_uploaded span").text(formatdate);
        }

        if (data.play_count !== undefined) {
            $trk.find('.play-count').text(data.play_count).attr('data-uid', data.uid);
            $trk.find('.counter:has(.play-count)').removeClass("d-none").addClass("d-flex");
        }

        if (data.likecounts !== undefined) {
            $trk.find('.like-count').text(data.likecounts).attr('data-uid', data.uid);
        }

        if (data.favoritecounts !== undefined) {
            $trk.find('.fav-count').text(data.favoritecounts).attr('data-uid', data.uid);
        }

        if (data.sharecounts !== undefined) {
            $trk.find('.share-count').text(data.sharecounts).attr('data-uid', data.uid);
        }

        // ----------------------------------------------------
        // ✨ НОВАЯ ЛОГИКА: СТИЛИЗАЦИЯ ПРИВАТНОГО ТРЕКА
        // ----------------------------------------------------
        const isPublicStatus = data.isPublic !== undefined ? String(data.isPublic) : '1';

        if (isPublicStatus === '0') {
            // Добавляем класс для заштрихованного серого фона
            $trk.addClass('track-card-private');
        }
        // ----------------------------------------------------

        if (data.winner_tour_info !== undefined && data.winner_tour_info !== null) {

            /*$trk.find('.special-info')
				.attr('data-uid', data.uid)
				.removeClass('d-none')
				.addClass('d-block')
				.html(`<span class="marquee-text" data-bs-toggle="tooltip" title="Победитель. 1 место. ${data.winner_tour_info}"><i class='fa fa-trophy'></i>${data.winner_tour_info}</span>`);
			*/
            const info = data.winner_tour_info;
            let placeClass = '';
            let placeText = 'Участник';
            let iconHtml = '';
            let cleanedText = info;

            if (info.startsWith('[WINNER]')) {
                placeClass = 'gold';
                placeText = 'Победитель. 1 место.';
                // 1 место: Трофей
                iconHtml = "<i class='fa fa-trophy'></i>";
                cleanedText = info.replace('[WINNER] ', '');
            } else if (info.startsWith('[SILVER]')) {
                placeClass = 'silver';
                placeText = '2 место.';
                // 2 место: Медаль + цифра 2
                iconHtml = "<i class='fa fa-medal'></i>";
                cleanedText = info.replace('[SILVER] ', '');
            } else if (info.startsWith('[BRONZE]')) {
                placeClass = 'bronze';
                placeText = '3 место.';
                // 3 место: Медаль + цифра 3
                iconHtml = "<i class='fa fa-award'></i>";
                cleanedText = info.replace('[BRONZE] ', '');
            }

            // Добавляем очищенный текст для использования в тултипе
            const fullTooltipTitle = `${placeText} ${cleanedText}`;

            // 2. Обновляем элемент $trk.find('.special-info')
            const $specialInfo = $trk.find('.special-info');


            // Сначала очищаем старые классы мест и добавляем новый
            $specialInfo
                .removeClass('d-none bg-gold bg-silver bg-bronze gold')
                .addClass(`d-flex ${placeClass}-medal winner-block`)
                .attr('data-uid', data.uid)
                .attr('data-place', placeText)
                .html(`
					<span class="marquee-text" data-bs-toggle="tooltip" title="${fullTooltipTitle}"  data-bs-original-title="${fullTooltipTitle}">
						${iconHtml} ${cleanedText}
					</span>
				`);



            render_tooltip()

            $trk.find('.special-info')
                .data('marquee-initialized', false)
                .marquee();


        }

        // Обработчики событий
        this._initTrackEventHandlers($trk, containerSelector, index);

        return $trk;
    }

    _moveArrayElement(arr, fromIndex, toIndex) {
        if (!Array.isArray(arr) || fromIndex === toIndex) return arr;
        const newArr = arr.slice();
        const [elem] = newArr.splice(fromIndex, 1);
        newArr.splice(toIndex, 0, elem);
        return newArr;
    }

    _initDragAndDrop(container) {
        const _this = this;
        const $container = $(container);
        let $placeholder = $('<div class="track-placeholder"></div>');
        let fromIndex = null;

        // убираем старые слушатели
        $container.off('dragstart.dragdrop drop.dragdrop dragover.dragdrop dragend.dragdrop .dragdrop');

        // dragstart: сохраняем индекс источника
        $container.on('dragstart.dragdrop', '.track-draggable', function (e) {
            fromIndex = parseInt($(this).attr('data-item-idx'), 10);
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            e.originalEvent.dataTransfer.setData('text/plain', String(fromIndex));
            $(this).addClass('dragging');
        });

        // dragover: нужно предотвращать дефолт, чтобы разрешить drop
        $container.on('dragover.dragdrop', '.track-draggable', function (e) {
            e.preventDefault();
            $(this).addClass('drag-over');
        });

        $container.on('dragleave.dragdrop', '.track-draggable', function () {
            $(this).removeClass('drag-over');
        });

        // drop: переставляем DOM и синхронизируем model (pl.list)
        $container.on('drop.dragdrop', '.track-draggable', function (e) {
            e.preventDefault();
            const fromIndex = parseInt(e.originalEvent.dataTransfer.getData('text/plain'), 10);
            const $target = $(this);
            const toIndex = parseInt($target.attr('data-item-idx'), 10);

            // очистка стилей
            $container.find('.drag-over').removeClass('drag-over');
            $container.find('.dragging').removeClass('dragging invisible-drag');

            if (isNaN(fromIndex) || isNaN(toIndex)) return;
            if (fromIndex === toIndex) return;

            // элементы
            const $tracks = $container.find(`.${_this.trackClass}`);
            const $fromEl = $tracks.filter(`[data-item-idx="${fromIndex}"]`);
            const $toEl = $tracks.filter(`[data-item-idx="${toIndex}"]`);

            if (!$fromEl.length || !$toEl.length) {
                // fallback: перестроим по DOM
                _this._resyncPlaylistIndexes(container);
                return;
            }

            // перемещение в DOM
            if (fromIndex < toIndex) {
                $toEl.after($fromEl);
            } else {
                $toEl.before($fromEl);
            }

            // теперь синхронизируем плейлист в this.playlists
            _this._rebuildPlaylistFromDOM(container);

            // уведомляем/перерисовываем плеер
            // если этот контейнер — текущий плейлист плеера, скорректируем currentIndex
            if (_this.currentPlaylist === container) {
                const pl = _this.playlists[container];
                if (pl && _this.currentTrack) {
                    const newIdx = pl.list.findIndex(item => item.data && item.data.uid === _this.currentTrack.uid);
                    pl.currentIndex = newIdx !== -1 ? newIdx : pl.currentIndex;
                }
            }

            // Триггерим событие — можно подписаться и сохранить порядок на сервере
            $container.trigger('playlistReordered', { container, list: _this.playlists[container]?.list || [] });
        });

        // dragend: чистим
        $container.on('dragend.dragdrop', '.track-draggable', function () {
            $container.find('.dragging').removeClass('dragging invisible-drag');
            $container.find('.drag-over').removeClass('drag-over');
        });
    }

    _rebuildPlaylistFromDOM(container) {
        const pl = this.playlists[container];
        if (!pl) return;

        const _this = this;
        const $tracks = $(`${container} .${this.trackClass}`);
        const newList = [];

        $tracks.each(function (idx) {
            const $el = $(this);
            const uid = $el.attr('data-uid');

            // находим соответствующий предмет в старом pl.list (по uid)
            const oldItem = pl.list.find(item => item.data && item.data.uid === uid);

            if (oldItem) {
                // обновляем ссылку на элемент, и индекс
                oldItem.$el = $el;
                newList.push(oldItem);
            } else {
                // если нет в pl.list (необычно), создаём минимальную запись из атрибутов
                const itemData = {
                    data: {
                        uid: uid,
                        title: $el.attr('data-title'),
                        artist: $el.attr('data-artist'),
                        duration: $el.attr('data-duration')
                    },
                    $el: $el
                };
                newList.push(itemData);
            }

            // обновляем data-item-idx на DOM-элементе
            $el.attr('data-item-idx', idx);
        });

        // сохраняем новый порядок
        pl.list = newList;

        // если плейлист отсортирован и есть currentTrack — обновим currentIndex корректно
        if (this.currentTrack && this.currentPlaylist === container) {
            const newIndex = pl.list.findIndex(item => item.data && item.data.uid === this.currentTrack.uid);
            pl.currentIndex = newIndex !== -1 ? newIndex : -1;
        }

        // лог для отладки
        console.log(`Playlist ${container} reordered. New length: ${pl.list.length}. CurrentIndex: ${pl.currentIndex}`);

        // обновляем индексы и UI (если нужно)
        this._resyncPlaylistIndexes(container);
    }

    // _resyncPlaylistIndexes — модифицируем, чтобы он обновлял data-item-idx и pl.list.$el
    _resyncPlaylistIndexes(container) {
        const pl = this.playlists[container];
        if (!pl) return;

        const $tracks = $(`${container} .${this.trackClass}`);
        $tracks.each((i, el) => {
            const $el = $(el);
            $el.attr('data-item-idx', i);
            if (pl.list[i]) {
                pl.list[i].$el = $el;
            }
        });

        // если currentTrack есть — пересчет currentIndex
        if (this.currentTrack && this.currentPlaylist === container) {
            const idx = pl.list.findIndex(item => item.data && item.data.uid === this.currentTrack.uid);
            pl.currentIndex = idx !== -1 ? idx : -1;
        }
    }


    _initTrackEventHandlers($trk, containerSelector, index) {
        const _this = this; // Сохраняем контекст класса

        // Клик по треку
        $trk.on('click', (e) => {
            const $target = $(e.target);

            // ... (Ваша логика игнорирования кликов по управляющим элементам остается без изменений)
            if ($target.closest(`
				.edit-cover-btn, 
				.cover-input,
				.save-cover-btn, 
				.edit-title-btn, 
				.save-title-btn,
				.edit-title-input, 
				.edit-artist-btn, 
				.save-artist-btn, 
				.edit-year-btn, 
				.save-year-btn, 
				.edit-genre-btn, 
				.genre-tag,
				.add-tag-input,
				.year-input,
				.add-tag-btn,
				.vote-button,
				.track-title a, 
				.track-artist a`
            ).length > 0) {
                return;
            }

            // 🚀 КЛЮЧЕВОЙ МОМЕНТ:
            // Вместо использования "запомненного" index, считываем актуальный
            // data-item-idx из атрибута $trk в момент клика.
            const currentTrackIndex = parseInt($trk.attr('data-item-idx'), 10);

            // Иначе — воспроизводим трек, используя АКТУАЛЬНЫЙ индекс
            if (!isNaN(currentTrackIndex) && currentTrackIndex !== -1) {
                _this._onTrackClick(containerSelector, currentTrackIndex);
            }
        });

        // Вешаем обработчики событий для seek (остается без изменений, но используем _this)
        $trk.find('.progress-bar-container').on('click', e => {
            e.stopPropagation();
            e.preventDefault();

            const $bar = $(e.currentTarget);
            const rect = $bar[0].getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = clickX / $bar.width();
            // Убедитесь, что 'this' внутри обработчика клика (который является функцией-стрелкой в вашем случае)
            // является экземпляром класса (или сохраните контекст, как сделано выше: const _this = this)
            _this.audioTrack.currentTime = pct * _this.audioTrack.duration;
        });
    }



    _updateTrackIndexes(containerSelector) {
        const $tracks = $(`${containerSelector} .${this.trackClass}`);
        $tracks.each((index, track) => {
            $(track).attr('data-item-idx', index); // Обновляем атрибут data-item-idx
        });
    }

    _firstTrack() {
        const playlists = Object.values(this.playlists);
        if (playlists.length === 0) {
            return []
        } else {
            const firstPlaylist = playlists[0];

            if (!firstPlaylist.list || firstPlaylist.list.length === 0) {
                return []
            } else {
                const firstTrack = firstPlaylist.list[0];
                return firstTrack.data
            }
        }
    }



    renderArtists = function(containerSelector, artistContainerSelector, data = null) {
        let tracks = [];

        // Если data передано — используем напрямую
        if (Array.isArray(data) && data.length) {
            tracks = data;
        } else {
            // иначе берём треки из текущего плейлиста
            const pl = this.playlists[containerSelector];
            if (!pl || !pl.list || pl.list.length === 0) {
                console.warn('Плейлист пуст или не найден:', containerSelector);
                return;
            }
            tracks = pl.list.map(t => t.data);
        }

        // Уникальные артисты
        const uniqueArtists = new Map();
        tracks.forEach(track => {
            if (track.artist && track.name) {
                if (!uniqueArtists.has(track.artist)) {
                    uniqueArtists.set(track.artist, {
                        name: track.artist,
                        author: track.name,
                        avatar: `/author/${track.name}/avatar?width=360q=9`,
                        id: track.ownerId,
                        uid: track.ownerUid
                    });
                }
            }
        });

        const $artistContainer = $(artistContainerSelector);
        $artistContainer.empty();

        uniqueArtists.forEach((artist, artistId) => {
            const $artistItem = $('<div>')
                .addClass('group-artist-item user-card')
                .attr({
                    'data-user-id': artist.id,
                    'data-user-uid': artist.uid,
                    'data-user-name': artist.name
                });

            const $avatar = $('<img>')
                .attr('src', artist.avatar)
                .attr('data-name', artist.name)
                .attr('alt', artist.name);

            const $link = $('<div>')
                .attr({
                    'title': artist.name,
                    'data-bs-toggle': 'tooltip'
                })
                .addClass('user-profile-avatar')
                .append($avatar);

            $artistItem.append($link);
            $artistContainer.append($artistItem);
        });

        if (typeof render_tooltip === 'function') render_tooltip();
    };

    _sendEventToServer(eventName, trackData = {}) {
        const $tpl = $($('#now-playing-template').html());
        const muted = this.audioTrack.muted;

        const safeTrackData = {
            ...trackData,
            duration: trackData.duration ? this._toTimecode(this._toSeconds(trackData.duration), 3) : "00:00",
            duration_played: trackData.duration_played ? this._toTimecode(this._toSeconds(trackData.duration_played), 3) : "00:00"
        };

        const eventData = {
            mode: this.mode,
            muted: muted,
            event: eventName,
            track: safeTrackData,

            timestamp: moment.tz('Europe/Moscow').format('YYYY-MM-DD HH:mm:ss'),

            user: this.user,
            device: {
                platform: navigator.platform,
                userAgent: navigator.userAgent,
                is_mobile: /Mobi/.test(navigator.userAgent)
            }
        };

        // Отправка через WebSocket
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(eventData));
        }

        // Резервная отправка через AJAX
        $.post(this.urlEvents, eventData).fail(err => {
            console.error("Ошибка отправки события:", err);
        });

        return eventData;
    }


    _loadTrackExtraInfo(uid) {
        // Проверка, что колбэк для запроса данных установлен
        if (typeof this.trackInfoCallback !== 'function') {
            console.warn('Не задан callback для получения информации о треке');
            return;
        }

        // Вызываем внешний callback, который делает AJAX-запрос
        this.trackInfoCallback(uid, (infoData) => {

            // КЛЮЧЕВАЯ ПРОВЕРКА: Ответ должен быть для трека, который сейчас играет
            if (this.currentTrack && this.currentTrack.uid === uid) {

                // 1. !!! КРИТИЧНОЕ СЛИЯНИЕ !!!
                // Объединяем старые данные (из localStorage) с новыми (с сервера).
                // В infoData могут быть только like_status и favorite_status,
                // но мы гарантируем, что они перепишут старые значения в this.currentTrack.
                this.currentTrack = { ...this.currentTrack, ...infoData };

                // 2. !!! ПРИНУДИТЕЛЬНАЯ ПЕРЕРИСОВКА UI !!!
                // Вызываем showCover, чтобы обновить обложку, лайки/фавориты,
                // название и другие метаданные, используя уже обновленный this.currentTrack.
                // Задержка 0, так как плеер уже показан.
                this.showCover(this.currentTrack, 0);

                // 3. Обновление только кнопок (на случай, если showCover это не делает)
                this._updateLikeAndFavButtons(infoData);

                console.log(`UI: Данные трека ${uid} (${this.currentTrack.title}) успешно обновлены с сервера.`);
            }
        });
    }

    addTrackToPlaylistBySelector(playlistSelector, trackData) {
        const playlist = this.playlists[playlistSelector];
        if (!playlist) {
            console.warn(`Плейлист '${playlistSelector}' не найден.`);
            sendMsg('error', `Плейлист "${playlistSelector}" не найден.`, 'error');
            return false;
        }

        // Проверяем, существует ли уже трек с таким UID в плейлисте
        const existingTrack = playlist.list.find(item => item.data.uid === trackData.uid);
        if (existingTrack) {
            console.warn(`Трек с UID '${trackData.uid}' уже существует в плейлисте '${playlistSelector}'.`);
            sendMsg('warn', `Трек "${trackData.title}" уже есть в плейлисте "${playlistSelector}".`, 'warn');
            return false; // Не добавляем дубликат
        }

        // Создаем новый HTML-элемент трека для DOM
        const newTrackIndex = playlist.list.length; // Индекс для нового трека
        const $newTrackElement = this._createTrackElement(trackData, playlistSelector, newTrackIndex, true); // Передаем true для isEditable

        // Добавляем трек во внутренний список плейлиста
        playlist.list.push({ data: trackData, $el: $newTrackElement });

        // Добавляем новый элемент трека в DOM
        $(playlistSelector).append($newTrackElement);

        // Обновляем индексы всех треков в этом плейлисте (на случай, если порядок важен)
        this._updateTrackIndexes(playlistSelector);

        console.log(`Трек '${trackData.title}' добавлен в плейлист '${playlistSelector}'.`);
        sendMsg('info', `Трек "${trackData.title}" добавлен в плейлист "${playlistSelector}".`, 'info');
        return true;
    }

    _updateLikeAndFavButtons(data) {
        const $player = this.playerElement || null;
        console.log(data);
        if($player !== undefined && $player !== null) {

            const uid = data.uid;

            ['fav', 'like', 'play', 'share'].forEach(type => {
                $player.find(`.${type}-count`).attr('data-uid', uid)
            });

            // указываем данные
            $(`.like-count[data-uid="${uid}"]`).text(data.likecounts);
            $(`.fav-count[data-uid="${uid}"]`).text(data.favoritecounts);
            $(`.share-count[data-uid="${uid}"]`).text(data.sharecounts);
            $(`.play-count[data-uid="${uid}"]`).filter(function() {
                return !$(this).closest('.track-card').is('[data-isplayingnow="1"]');
            }).text(data.playcounts);

            $('.track_id').text(data.id);
            $('.track_uid').text(data.uid);

            if($player.find('[data-action="like"]').length > 0) {
                $player.find('[data-action="like"]').toggleClass('active', data.like_status === 1 ? true : false);
            }

            if($player.find('[data-action="fav"]').length > 0) {
                $player.find('[data-action="fav"]').toggleClass('active', data.favorite_status === 1  ? true : false);
            }


            if(data.winner_tour_info !== undefined && data.winner_tour_info !== null) {
                $player.find('.special-info').html(`<span class="marquee-text" data-bs-toggle="tooltip" title="Победитель. 1 место. ${data.winner_tour_info}"><i class='fa fa-trophy'></i>${data.winner_tour_info}</span>`);
                render_tooltip()
                const $titleContainer = $player.find('.special-info');
                $titleContainer
                    .data('marquee-initialized', false)
                    .marquee();
            } else {

                $player.find('.special-info').empty();
            }

            // Показываем/скрываем пункты меню по умолчанию
            $player.find('[data-action="edit"]').hide();
            $player.find('[data-action="assignToEvent"]').hide();
            $player.find('[data-action="tourInfo"]').hide();
            $player.find('[data-action="deleteTrack"]').hide();

            // Получаем данные трека из текущего элемента .now-playing
            const $nowPlaying = $player.find('.now-playing');
            const trackOwnerId = $nowPlaying.attr('data-ownerId');
            const isInTour = $nowPlaying.attr('data-isintour') && parseInt($nowPlaying.attr('data-isintour'), 10) !== 0;
            const tourInfo = $nowPlaying.attr('data-tourinfo') ? $nowPlaying.attr('data-tourinfo') : "Участвовал в туре";
            const tourUid = $nowPlaying.attr('data-touruid') ? `/tours/${$nowPlaying.attr('data-touruid')}` : "#";

            const isUserOrAdmin = this.user.isAdmin || (trackOwnerId === this.user.id.toString());



            if (isUserOrAdmin) {
                $player.find('[data-action="edit"]').show();
                $player.find('[data-action="deleteTrack"]').show();
                if (!isInTour) {
                    if(!this.user.isAdmin) {
                        $player.find('[data-action="edit"]').hide();
                        $player.find('[data-action="deleteTrack"]').hide();
                    }
                    $player.find('[data-action="assignToEvent"]').show();
                } else {
                    $player.find('[data-action="tourInfo"] a').text(tourInfo).attr('href', tourUid);
                    $player.find('[data-action="tourInfo"]').show();
                }
            } else {
                if (isInTour) {
                    $player.find('[data-action="tourInfo"] a').text(tourInfo).attr('href', tourUid);
                    $player.find('[data-action="tourInfo"]').show();
                }
            }
        }

    }

    _capitalize(str) {
        return str//.charAt(0).toUpperCase() + str.slice(1);
    }

    // утилиты
    _toSeconds(tc) {
        const parts = tc.split(':').map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        } else {
            return 0;
        }
    }

    _toTimecode(sec, format = 2) {
        const hours = Math.floor(sec / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const seconds = Math.floor(sec % 60);

        switch (format) {
            case 1: // Только секунды
                return `${seconds}`;
            case 2: // MM:SS
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            case 3: // HH:MM:SS
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            default:
                return this._toTimecode(sec); // Резервный вариант (MM:SS)
        }
    }

    // Метод для получения перемешанного массива
    _getShuffledArray(array) {
        let shuffled = [...array]; // Создаем копию массива, чтобы не изменять оригинал
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Обмен элементов
        }
        return shuffled;
    }

    _shufflePlaylistInternal(playlistKey) {
        const pl = this.playlists[playlistKey];
        if (!pl || !pl.list || pl.list.length === 0) {
            console.warn(`[SHUFFLE_INTERNAL] Плейлист ${playlistKey} не найден или пуст.`);
            return;
        }

        // Создаем массив индексов [0, 1, 2, ..., N-1]
        let indices = pl.list.map((_, index) => index);

        // Алгоритм Фишера-Йетса для перемешивания
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        pl.shuffledList = indices;
        pl.shuffledCurrentIndex = -1; // Сбрасываем индекс для нового шафла

        //console.log(`[SHUFFLE_INTERNAL] Плейлист ${playlistKey} успешно перемешан. Длина: ${indices.length}.`);
    }

    _setupOffcanvasScrollListener() {
        const $scroll = $(this.OFFCANVAS_BODY_SELECTOR);
        let timer = null;

        const LOAD_THRESHOLD = 300;

        $scroll.on('scroll', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const top = $scroll.scrollTop();
                const height = $scroll.height();
                const full = $scroll[0].scrollHeight;

                const currentKey = this.offcanvasCurrentPlaylistKey;

                // !!! ГАРАНТИЯ: ИСПОЛЬЗУЕМ СОХРАНЕННУЮ ДЛИНУ ПЛЕЙЛИСТА
                const total = this.offcanvasCurrentPlaylistTotal || 0;
                const target = total > 0 ? true : null; // Считаем, что плейлист доступен, если длина > 0

                // Лог текущих параметров и ключа
                //console.log(`[SCROLL_DEBUG] Top: ${top.toFixed(0)}, Height: ${height.toFixed(0)}, Full: ${full.toFixed(0)}. Threshold Down: ${(full - LOAD_THRESHOLD).toFixed(0)}, Threshold Up: ${LOAD_THRESHOLD}.`);


                // догрузка вниз
                if (top + height >= full - LOAD_THRESHOLD) {

                    // Важный лог для проверки
                    //console.log(`[SCROLL_DOWN_CHECK] Key: ${currentKey}, EndIndex: ${this.offcanvasEndIndex}, Total: ${total}, Total-1: ${total - 1}`);

                    if (target && this.offcanvasEndIndex < total - 1) {
                        console.log('[SCROLL_DEBUG] Trigger DOWN load.');
                        this._renderNextOffcanvasTracks();
                    } else {
                        // Здесь total - 1 должен быть 16
                        //console.log(`[SCROLL_DEBUG] Down load blocked: EndIndex (${this.offcanvasEndIndex}) >= Total-1 (${total - 1}) or playlist missing.`);
                    }
                }

                // догрузка вверх
                if (top <= LOAD_THRESHOLD) {
                    if (this.offcanvasStartIndex > 0) {
                        console.log('[SCROLL_DEBUG] Trigger UP load.');
                        this._renderPrevOffcanvasTracks();
                    } else {
                        //console.log('[SCROLL_DEBUG] Up load blocked: Start of list reached.');
                    }
                }
            }, 80);
        });
    }





    _getOffcanvasTargetPlaylist(playlistKey) {
        const INVISIBLE_SHUFFLE_KEY = 'global-shuffle-pool-invisible';
        let targetPlaylist = null;
        let listForDisplay = null;

        // 1. Определение целевого плейлиста
        if (playlistKey === this.GLOBAL_SHUFFLE_KEY || playlistKey === INVISIBLE_SHUFFLE_KEY) {
            targetPlaylist = this.playlists[INVISIBLE_SHUFFLE_KEY];
        }
        else {
            targetPlaylist = this.playlists[playlistKey];
        }

        // 2. Проверка существования плейлиста
        if (!targetPlaylist || !targetPlaylist.list || targetPlaylist.list.length === 0) {
            // Этот лог поможет нам понять, почему плейлист отсутствует
            console.error(`[GET_PLAYLIST_FAIL] Playlist missing or empty for key: ${playlistKey}. Current keys in this.playlists: ${Object.keys(this.playlists).join(', ')}`);
            return null;
        }

        // 3. Определение порядка отображения (шафл или исходный)
        const isShufflePool = targetPlaylist.container === INVISIBLE_SHUFFLE_KEY || targetPlaylist.container === this.GLOBAL_SHUFFLE_KEY;
        const isShuffled = targetPlaylist.shuffledList && targetPlaylist.shuffledList.length === targetPlaylist.list.length;

        if (isShufflePool && isShuffled) {
            listForDisplay = targetPlaylist.shuffledList.map(index => {
                const item = targetPlaylist.list[index];
                return item ? item.data : null;
            }).filter(data => data !== null);

        } else {
            listForDisplay = targetPlaylist.list.map(item => item.data);
        }

        return {
            originalPlaylist: targetPlaylist,
            listForDisplay: listForDisplay,
            length: listForDisplay.length
        };
    }

    _renderNextOffcanvasTracks() {
        const playlistKey = this.offcanvasCurrentPlaylistKey;
        const target = this._getOffcanvasTargetPlaylist(playlistKey);
        if (!target) return;

        const all = target.listForDisplay;
        const total = all.length;

        // Если всё показано — выход
        if (this.offcanvasEndIndex >= total - 1) {
            console.warn('[OFFCANVAS_LOAD_DOWN] Конец списка достигнут. Блокировка.');
            return;
        }

        // Следующее окно
        const nextStart = this.offcanvasEndIndex + 1;
        const nextEnd = Math.min(total - 1, nextStart + this.offcanvasTracksStep - 1);

        const slice = all.slice(nextStart, nextEnd + 1);

        //console.log(`[OFFCANVAS_LOAD_DOWN] nextStart=${nextStart} nextEnd=${nextEnd}. Slice length: ${slice.length}`);

        const $container = $(this.OFFCANVAS_LIST_SELECTOR);

        // Используем уникальный ID для точного таргетинга
        const tempId = 'temp-slice-' + Date.now();
        const $newDiv = $('<div>').addClass('offcanvas-tracks-slice').attr('id', tempId);

        $container.append($newDiv);

        setPlayList(`#${tempId}`, slice, '', false, false);

        // Удаляем ID после использования
        $newDiv.removeAttr('id');

        this.offcanvasEndIndex = nextEnd;
    }

    _renderPrevOffcanvasTracks() {
        const playlistKey = this.offcanvasCurrentPlaylistKey;
        const target = this._getOffcanvasTargetPlaylist(playlistKey);
        if (!target) return;

        const all = target.listForDisplay;

        // Если уже в начале — выход
        if (this.offcanvasStartIndex <= 0) {
            console.warn('[OFFCANVAS_LOAD_UP] Начало списка достигнуто.');
            return;
        }

        const nextEnd = this.offcanvasStartIndex - 1;
        const nextStart = Math.max(0, nextEnd - this.offcanvasTracksStep + 1);

        const slice = all.slice(nextStart, nextEnd + 1);

        //console.log(`[OFFCANVAS_LOAD_UP] nextStart=${nextStart} nextEnd=${nextEnd}. Slice length: ${slice.length}`);

        const $container = $(this.OFFCANVAS_LIST_SELECTOR);

        // Используем уникальный ID для точного таргетинга
        const tempId = 'temp-slice-' + Date.now();
        const $newDiv = $('<div>').addClass('offcanvas-tracks-slice').attr('id', tempId);

        // Вставляем В НАЧАЛО
        $container.prepend($newDiv);

        setPlayList(`#${tempId}`, slice, '', false, false);

        // --- КОРРЕКТИРОВКА СКРОЛЛА ПРИ ДОЗАГРУЗКЕ ВВЕРХ ---
        const $scroll = $(this.OFFCANVAS_BODY_SELECTOR);
        // Получаем высоту только что вставленного блока.
        const newSliceHeight = $newDiv.outerHeight(true) || 500;

        // Смещаем скролл на высоту нового блока
        $scroll.scrollTop($scroll.scrollTop() + newSliceHeight);
        // -----------------------------------------------------------

        // Удаляем ID после использования
        $newDiv.removeAttr('id');

        this.offcanvasStartIndex = nextStart;
    }



    renderOffcanvasFromPlaylist(containerSelector, playlistKey) {
        const container = $(containerSelector);
        container.empty();

        // 1. Устанавливаем ключ
        this.offcanvasCurrentPlaylistKey = playlistKey;

        const target = this._getOffcanvasTargetPlaylist(playlistKey);
        if (!target) {
            this.offcanvasCurrentPlaylistTotal = 0; // Сброс длины, если плейлист не найден
            return;
        }

        const allTracks = target.listForDisplay;
        const total = allTracks.length;

        // !!! СОХРАНЯЕМ ОБЩУЮ ДЛИНУ ДЛЯ ИСПОЛЬЗОВАНИЯ В SCROLL LISTENER !!!
        this.offcanvasCurrentPlaylistTotal = total;

        // === 2. Находим индекс текущего трека в списке ===
        let currentIndex = 0;
        if (this.currentTrack) {
            currentIndex = allTracks.findIndex(t => t.uid === this.currentTrack.uid);
            if (currentIndex === -1) {
                currentIndex = 0;
            }
        }

        // === 3. Формируем окно видимости вокруг текущего трека ===
        const windowSize = this.offcanvasTracksStep || 10;
        const start = Math.max(0, currentIndex - Math.floor(windowSize / 2));
        const end = Math.min(total - 1, start + windowSize - 1);

        this.offcanvasStartIndex = start;
        this.offcanvasEndIndex = end;

        const slice = allTracks.slice(start, end + 1);

        //console.log(`[OFFCANVAS_INIT] total=${total} start=${start} end=${end} current=${currentIndex}`);

        // === 4. Рендер среза ===
        const $sliceDiv = $('<div>').addClass('offcanvas-tracks-slice');
        container.append($sliceDiv);

        // Используем более точный селектор, если у вас несколько .offcanvas-tracks-slice
        setPlayList('.offcanvas-tracks-slice:first-child', slice, '', false, false);
    }


    // Метод для получения следующего индекса в циклическом массиве
    _getNextCyclicIndex(currentIndex, arrayLength, direction = 1) {
        if (arrayLength === 0) return -1;
        let nextIndex = currentIndex + direction;
        if (nextIndex >= arrayLength) {
            return 0; // Возвращаемся в начало
        }
        if (nextIndex < 0) {
            return arrayLength - 1; // Возвращаемся в конец
        }
        return nextIndex;
    }

    // Открыть модальное окно выбора тура для отправки трека
    openAssignTourModal(currentTrack) {

        const trackTitle = currentTrack.title;
        sendMsg('info', `Трек "${trackTitle}" будет отправлен в тур.`, 'info');
        console.log('Отправить в тур:', currentTrack);

        const modal = $('#assignTourModalOverlay');
        const assignTourModal = $('#assignTourModalOverlay .container-modal');

        modal
            .attr('data-title', currentTrack.title)
            .attr('data-artist', currentTrack.artist)
            .attr('data-uid', currentTrack.uid);

        // Очистить список и подгрузить активные туры
        assignTourModal.find('.tour-list').empty();
        if (typeof this.loadActiveTours === 'function') {
            this.loadActiveTours((tours) => {
                tours.forEach(t => {
                    const selector = `
						<button type="button" class="list-group-item list-group-item-action bg-dark text-white d-flex align-items-center" data-uid="${t.uid}">
							<img src="${t.cover}" style="width:40px; height:40px; border-radius:6px; object-fit:cover; margin-right:10px;">
							<div>
								<div class="fw-bold">${t.title}</div>
								<div class="small text-muted">${t.description || ''}</div>
							</div>
						</button>
					`;
                    const item = $(selector);
                    item.on('click', () => this.sendTrackToTour(currentTrack.uid, t.uid));
                    $list.append(item);
                });
            });
        }

        modal.removeClass('d-none').show();
    }

    closeAssignTourModal() {
        $('#assignTourModalOverlay').addClass('d-none').hide();
    }

    // Отправить трек в тур
    async sendTrackToTour(trackUid, tourUid) {
        try {
            await $.ajax({
                url: '/api/assigntour',
                type: 'POST',
                data: { track_uid: trackUid, tour_uid: tourUid },
                headers: { 'Authorization': 'Bearer ' + getCookie('authToken') },
                success: (response) => {
                    sendMsg('info', response, 'info');
                    this.closeAssignTourModal();
                    this.closeAddUserTrackModal();
                },
                error: (xhr) => {
                    sendMsg('error', xhr.responseText, 'error');
                }
            });
        } catch (err) {
            sendMsg('error', 'Ошибка отправки трека в тур', 'error');
        }
    }

    // Модалка "добавить свой трек" в туре
    openAddUserTrackModal(tourUid) {
        const modal = $('#addUserTrackModalOverlay');
        const trackList = modal.find('.user-track-list');
        trackList.empty();

        if (typeof this.loadUserTracks === 'function') {
            this.loadUserTracks((tracks) => {
                tracks.forEach(tr => {
                    const item = $(`<div class="track-item" data-uid="${tr.uid}">${tr.title}</div>`);
                    item.on('click', () => this.sendTrackToTour(tr.uid, tourUid));
                    trackList.append(item);
                });
            });
        }

        modal.removeClass('d-none').show();
    }

    closeAddUserTrackModal() {
        $('#addUserTrackModalOverlay').addClass('d-none').hide();
    }

    // === Внешние колбэки ===
    onLoadUserTracks(callback) {
        if (typeof callback === 'function') {
            this.loadUserTracks = callback;
        }
    }

    onLoadActiveTours(callback) {
        if (typeof callback === 'function') {
            this.loadActiveTours = callback;
        }
    }

    close() {
        if (!this.playerElement) return;
        this.audioTrack.pause();
        this.playerElement.detach(); // <-- важная штука
    }
}
window.Player = Player;
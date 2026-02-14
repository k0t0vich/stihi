// DEBUG & CONFIG
const isDebug = false;

function detectIsMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

// Для мобильных - всегда старая система, для десктопа - можно переключать
let isOld = detectIsMobile(); // true = Old/Mobile system, false = New/Desktop system
// const isOld = true; // Force Old system
// const isOld = false; // Force New system

// Ключ для сохранения выбора режима в localStorage
const VOTING_MODE_KEY = 'votingSystem_mode';

class VotingSystem {
    constructor(player, containerSelector, { user = null, eventUid = null, tourUid = null, voitedCount = 10 } = {}) {

        console.log("VotingSystem 2.1");
        $('.voting-alert').remove();

        if (!user && !isDebug) {
            console.error("User ID is not defined");
            return;
        }

        // В debug режиме создаём фейковый user если его нет
        if (!user && isDebug) {
            user = { id: 999999, uid: 'debug-user' };
            console.log('[DEBUG] Используется фейковый user:', user);
        }

        this.player = player;
        this.containerSelector = containerSelector;
        this.user = user;
        this.votes = {}; // { trackUid: place }
        this.MAX_VOTES = voitedCount;
        this.remainingPlaces = Array.from({ length: this.MAX_VOTES }, (_, i) => i + 1);
        this.tracks = []; // Array of track objects
        this.eventUid = eventUid;
        this.tourUid = tourUid;
        this.votingLocked = false; // Флаг блокировки после отправки голоса

        // Ключ для хранения данных голосования по ID голосования
        this.votingStateKey = `voting_${this.eventUid}_${this.tourUid}`;

        // Для десктопа - загружаем сохранённый режим
        if (!detectIsMobile()) {
            this._loadSavedMode();
        }

        this.init();
    }

    // Загрузка сохранённого режима из localStorage
    _loadSavedMode() {
        try {
            const savedMode = localStorage.getItem(VOTING_MODE_KEY);
            if (savedMode !== null) {
                isOld = savedMode === 'old';
            }
        } catch (e) {
            console.error('[VotingSystem] Error loading saved mode:', e);
        }
    }

    // Сохранение режима в localStorage
    _saveModePreference(useOldMode) {
        try {
            localStorage.setItem(VOTING_MODE_KEY, useOldMode ? 'old' : 'new');
        } catch (e) {
            console.error('[VotingSystem] Error saving mode preference:', e);
        }
    }

    init() {
        this._collectTracks();

        // Permission check serves as a gatekeeper
        const canVote = this._checkPermissions();
        if (!canVote) {
            // Если не можем голосовать - полностью останавливаем инициализацию
            return;
        }

        if (isOld) {
            this._initOld();
        } else {
            this._init();
        }
    }

    // --- SHARED METHODS ---

    _collectTracks() {
        const $container = $(this.containerSelector);
        const $trackElements = $container.find('.track-card');
        const self = this;

        this.tracks = $trackElements.map(function() {
            const $el = $(this);
            // Combine data reading from both systems (Old system read more data like 'isvoted')
            const isVoted = $el.data('isvoted') === 1;
            const place = $el.data('place') ? parseInt($el.data('place'), 10) : null;

            return {
                element: this,
                uid: $el.data('uid'),
                title: $el.data('title'),
                artist: $el.data('artist'),
                userId: $el.data('userid'),
                isVoted: isVoted,
                place: place,
                listenProgress: 0, // Maximum progress listened (0-100%)
                duration: $el.data('duration') || 0 // Track duration in seconds
            };
        }).get();

        // В New System голоса определяются порядком сортировки, старые данные не нужны
        if (isOld && !isDebug) {
            this.tracks.forEach(track => {
                if (track.isVoted && track.place !== null) {
                    this.votes[track.uid] = track.place;
                    this.remainingPlaces = this.remainingPlaces.filter(p => p !== track.place);
                }
            });
        }
    }

    _checkPermissions() {
        const $container = $(this.containerSelector);
        $('.voting-alert').remove();

        // If DEBUG, we bypass standard checks and allow voting
        if (isDebug) {
            // Clean up UI in debug mode
            if (!isOld) $container.find('.vote-button').remove();
            return true;
        }

        // --- Real Permission Logic ---

        // 1. Check if user is a competing artist
        const isCompetingArtist = this.tracks.some(track => parseInt(track.userId, 10) === this.user.id);

        if (!isCompetingArtist) {
            const $alertElement = $('<div>')
                .addClass('voting-alert danger-alert')
                .text('Вы не являетесь конкурсным артистом тура и не можете голосовать.');

            $container.before($alertElement);
            return false;
        }

        // 2. Check if already fully voted and SAVED to server (data-isvoted="1")
        // Проверяем только сохраненные на сервере голоса (DOM с data-isvoted="1")
        const savedVotesCount = $container.find('[data-isvoted="1"]').length;

        if (savedVotesCount >= this.MAX_VOTES) {
            const $alertElement = $('<div>')
                .addClass('voting-alert info-alert')
                .text('Вы уже проголосовали за все места.');

            $container.before($alertElement);
            return false;
        }

        return true;
    }


    sendVote(sortedVotes) {
        const self = this;

        // Проверка блокировки
        if (this.votingLocked) {
            this._showToast('Голосование уже отправлено', 'error');
            return;
        }

        const payload = sortedVotes.map(([trackUid, place]) => ({
            user: this.user.uid,
            event: this.eventUid,
            tour: this.tourUid,
            track: trackUid,
            place
        }));

        if (isDebug) {
            const alertMessage = "TEST MODE: Голоса отправлены!\n\nPayload:\n" +
                                 JSON.stringify(payload, null, 2);
            alert(alertMessage);
            console.log("TEST MODE Payload:", payload);
            this._showToast('TEST MODE: Голоса отправлены!', 'success');
            // В debug режиме тоже блокируем
            this._lockVotingAfterSubmit();
            return;
        }

        // Real Send
        $.ajax({
            url: '/api/vote',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            headers: {
                'Authorization': 'Bearer ' + getCookie('authToken')
            },
            success: function(response) {
                self._showToast('Ваши голоса успешно отправлены!', 'success');
                // Блокируем повторную отправку после успешной отправки
                self._lockVotingAfterSubmit();
            },
            error: function(xhr, status, error) {
                self._showToast('Ошибка при отправке голосов', 'error');
                console.error("Ошибка при отправке голоса:", error);
            }
        });
    }

    // Блокировка голосования после отправки
    _lockVotingAfterSubmit() {
        this.votingLocked = true;

        // Очищаем все активности голосования
        this.votes = {};
        this.remainingPlaces = [];

        // Очищаем флаги voted у треков
        this.tracks.forEach(track => {
            track.voted = false;
        });

        // ВАЖНО: Очищаем состояние голосования из localStorage
        this._clearVotingState();

        // Скрываем панель отправки
        $('#submit-votes-panel').addClass('hidden');

        // Убираем кнопки голосования
        $(this.containerSelector).find('.vote-button').prop('disabled', true).text('Отправлено');

        // Делаем badge неактивными
        $(this.containerSelector).find('.rank-badge').css('pointer-events', 'none').css('opacity', '0.3');

        // Отключаем drag-and-drop
        if (this.sortableInstance) {
            this.sortableInstance.option('disabled', true);
        }

        // Убираем переключатель режимов
        $('#voting-mode-toggle').remove();

        // Показываем оверлей с сообщением
        this._showVotingLockedOverlay();
    }

    // Показ оверлея о заблокированном голосовании
    _showVotingLockedOverlay() {
        const $overlay = $('<div>').addClass('voting-locked-overlay');
        const $message = $('<div>').addClass('voting-locked-message');
        $message.html('<h3>✓ Голоса отправлены!</h3><p>Спасибо за участие в голосовании.</p>');
        $overlay.append($message);
        $('body').append($overlay);

        // Автоматически скрываем через 3 секунды
        setTimeout(() => {
            $overlay.fadeOut(500, function() {
                $(this).remove();
            });
        }, 3000);
    }

    _showToast(message, type = 'info') {
        const $toast = $('<div>').addClass(`toast ${type}-toast`).text(message);
        $('body').append($toast);
        setTimeout(() => {
            $toast.addClass('show');
            setTimeout(() => {
                $toast.removeClass('show');
                setTimeout(() => $toast.remove(), 300);
            }, 3000);
        }, 10);
    }

    // --- MOBILE / OLD SYSTEM METHODS ---

    _initOld() {
        // Добавляем переключатель режимов только для десктопа
        if (!detectIsMobile()) {
            this._renderModeToggle();
        }
        this._renderVoteButtons();
        this._bindVoteButtonClicks();
        this._checkAndRenderResultsButton();
    }

    _renderVoteButtons() {
        // Logic similar to _checkPermissions was here, but we moved the checks.
        // Here we just render the buttons for valid tracks.
        
        const $container = $(this.containerSelector);
        
        this.tracks.forEach(track => {
            // Skip user's own track
            if (parseInt(track.userId, 10) === this.user.id) {
                $(track.element).find('.rating-container').html('<span class="vote-status">Вы не можете голосовать за самого себя!</span>');
                $(track.element).find('.vote-button').remove(); 
                return;
            }
            
            let $voteButton = $(track.element).find('.vote-button');
            
            if ($voteButton.length === 0) {
                $voteButton = $('<button>').addClass('vote-button');
                const $ratingContainer = $(track.element).find('.rating-container');
                if ($ratingContainer.length) {
                    $ratingContainer.empty().append($voteButton);
                } else {
                    const $cardInfo = $(track.element).find('.card-info');
                    if ($cardInfo.length) {
                        $cardInfo.append($voteButton);
                    }
                }
            }
            
            // Update button state
            if (this.votes[track.uid]) {
                $voteButton.text(`${this.votes[track.uid]} место`).addClass('voted');
            } else {
                $voteButton.text('Голосовать').removeClass('voted');
            }
        });
    }

    _bindVoteButtonClicks() {
        const self = this;
        $('body').off('click', `${this.containerSelector} .vote-button`);
        $('body').on('click', `${this.containerSelector} .vote-button`, function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const $card = $(this).closest('.track-card');
            const trackUid = $card.data('uid');
            
            if (self.votes[trackUid]) {
                self.openCancelModal($card, trackUid);
            } else {
                self.openVoteModal($card, trackUid);
            }
        });
    }

    openVoteModal($card, trackUid) {
        const self = this;
        const $modal = this._createVoteModal(trackUid);
        $('body').append($modal);
        
        $modal.find('[data-place]').on('click', function() {
            const place = parseInt($(this).data('place'), 10);
            if (!self.remainingPlaces.includes(place)) return;
            
            self.votes[trackUid] = place;
            self.remainingPlaces = self.remainingPlaces.filter(p => p !== place);
            
            self._updateTrackCard($card, trackUid);
            self._checkAndRenderResultsButton();
            $modal.remove();
        });
        
        $modal.find('.modal-close').on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }

    openCancelModal($card, trackUid) {
        const self = this;
        const $modal = this._createCancelModal(trackUid);
        $('body').append($modal);
        
        $modal.find('.confirm-cancel').on('click', function() {
            const place = self.votes[trackUid];
            delete self.votes[trackUid];
            self.remainingPlaces.push(place);
            self.remainingPlaces.sort((a, b) => a - b);
            
            self._updateTrackCard($card, trackUid);
            self._checkAndRenderResultsButton();
            $modal.remove();
        });
        
        $modal.find('.modal-close').on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }

    _updateTrackCard($card, trackUid) {
        const $voteButton = $card.find('.vote-button');
        if ($voteButton.length === 0) return;
        
        if (this.votes[trackUid]) {
            $voteButton.text(`${this.votes[trackUid]} место`).addClass('voted');
        } else {
            $voteButton.text('Голосовать').removeClass('voted');
        }
    }

    _checkAndRenderResultsButton() {
        const votedInDomCount = $(this.containerSelector).find('[data-isvoted="1"]').length;
        
        // В Debug режиме игнорируем votedInDomCount, т.к. мы сбрасываем состояние
        if (Object.keys(this.votes).length === this.MAX_VOTES) {
             if (isDebug || votedInDomCount < this.MAX_VOTES) {
                 this.showResultsModal();
             }
        }
    }

    _createVoteModal(trackUid) {
        const $modal = $('<div>').addClass('modal-overlay');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('На какое место хотели бы поставить трек?');
        const $placeButtons = $('<div>').addClass('place-buttons');
        
        this.remainingPlaces.forEach(place => {
            const $button = $('<button>').addClass('place-button').attr('data-place', place).text(place);
            $placeButtons.append($button);
        });
        
        const $closeButton = $('<button>').addClass('modal-close cancel-button').text('Отменить');
        $modalContent.append($heading).append($placeButtons).append($closeButton);
        $modal.append($modalContent);
        return $modal;
    }

    _createCancelModal(trackUid) {
        const $modal = $('<div>').addClass('modal-overlay');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('Отменить голосование?');
        const $message = $('<p>').addClass('modal-message').text(`Вы действительно хотите отменить голос на ${this.votes[trackUid]} место?`);
        
        const $buttonContainer = $('<div>').addClass('modal-actions');
        const $confirmButton = $('<button>').addClass('confirm-cancel danger-button').text('Да, отменить');
        const $closeButton = $('<button>').addClass('modal-close cancel-button').text('Нет');
        
        $buttonContainer.append($confirmButton).append($closeButton);
        $modalContent.append($heading).append($message).append($buttonContainer);
        $modal.append($modalContent);
        return $modal;
    }

    // --- DESKTOP / NEW SYSTEM METHODS ---

    _init() {
        this._renderModeToggle(); // Добавляем переключатель режимов
        this._loadAndRestoreVotingState(); // Загружаем и восстанавливаем состояние из localStorage
        this._initialSort(); // Устанавливаем порядок карточек
        this._setupDragAndDrop();
        this._renderSubmitControl();
        this._initializeVotedFlags(); // Initialize voted flags
        this._updateRankings();
        this._monkeyPatchPlayer(); // Патчим плеер ПОСЛЕ создания badge
        this._setPlayerPlayList();
        this._setupPlayerListeners(); // Listen for play events
        this._initializeListenIndicators(); // Initialize listen progress indicators
    }

    // Рендеринг переключателя режимов для десктопа
    _renderModeToggle() {
        $('#voting-mode-toggle').remove();

        const $toggle = $('<div>').attr('id', 'voting-mode-toggle').addClass('voting-mode-toggle');
        const $label = $('<span>').addClass('mode-label').text('Режим голосования:');

        const $switchContainer = $('<div>').addClass('mode-switch-container');
        const $newLabel = $('<span>').addClass('mode-option').text('Новый');
        const $switch = $('<label>').addClass('mode-switch');
        const $checkbox = $('<input>').attr('type', 'checkbox').prop('checked', isOld);
        const $slider = $('<span>').addClass('slider');
        $switch.append($checkbox).append($slider);
        const $oldLabel = $('<span>').addClass('mode-option').text('Старый');

        $switchContainer.append($newLabel).append($switch).append($oldLabel);
        $toggle.append($label).append($switchContainer);

        $(this.containerSelector).before($toggle);

        const self = this;
        $checkbox.on('change', function() {
            const useOldMode = $(this).prop('checked');
            self._switchMode(useOldMode);
        });

        this._injectModeToggleStyles();
    }

    // Переключение режима голосования
    _switchMode(useOldMode) {
        if (this.votingLocked) {
            this._showToast('Голосование уже отправлено', 'error');
            return;
        }

        // Подтверждение переключения
        const confirmed = confirm('При переключении режима все данные голосования будут сброшены. Продолжить?');
        if (!confirmed) {
            // Возвращаем переключатель в исходное положение
            $('#voting-mode-toggle input[type="checkbox"]').prop('checked', isOld);
            return;
        }

        // Сохраняем выбор
        this._saveModePreference(useOldMode);

        // Очищаем все данные голосования
        this._clearAllVotingData();

        // Обновляем глобальную переменную режима
        isOld = useOldMode;

        // Применяем новый режим без перезагрузки
        this._applyModeSwitch(useOldMode);
    }

    // Применение переключения режима без перезагрузки страницы
    _applyModeSwitch(useOldMode) {
        const $container = $(this.containerSelector);

        if (useOldMode) {
            // Переключаемся на старый режим
            // Скрываем элементы нового режима
            $container.find('.rank-badge').hide();
            $container.find('.listen-indicator').hide();
            $('#submit-votes-panel').hide();

            // Отключаем drag-and-drop
            if (this.sortableInstance) {
                this.sortableInstance.option('disabled', true);
            }

            // Убираем cursor: grab
            $container.find('.track-card').css('cursor', 'default');

            // Инициализируем старый режим
            this._renderVoteButtons();
            this._bindVoteButtonClicks();
        } else {
            // Переключаемся на новый режим
            // Скрываем/удаляем элементы старого режима
            $container.find('.vote-button').hide();

            // Показываем элементы нового режима
            $container.find('.rank-badge').show();
            $container.find('.listen-indicator').show();

            // Включаем drag-and-drop
            if (this.sortableInstance) {
                this.sortableInstance.option('disabled', false);
            } else {
                this._setupDragAndDrop();
            }

            // Добавляем cursor: grab
            $container.find('.track-card').css('cursor', 'grab');

            // Рендерим панель подтверждения
            this._renderSubmitControl();
            this._initializeVotedFlags();
            this._updateRankings();

            // Устанавливаем перехватчики кликов для badge (если ещё не установлены)
            this._monkeyPatchPlayer();
        }
    }

    // Полная очистка всех данных голосования
    _clearAllVotingData() {
        // Очищаем голоса
        this.votes = {};
        this.remainingPlaces = Array.from({ length: this.MAX_VOTES }, (_, i) => i + 1);

        // Очищаем флаги voted у треков
        this.tracks.forEach(track => {
            track.voted = false;
            track.listenProgress = 0;
        });

        // Очищаем состояние голосования из localStorage
        this._clearVotingState();

        // Сбрасываем UI элементы (но не удаляем, только сбрасываем состояние)
        $(this.containerSelector).find('.rank-badge').removeClass('voted prize non-prize').addClass('non-voted');
        $(this.containerSelector).find('.listen-indicator .listen-percent').text('0%').removeClass('low medium high').addClass('low');
        $(this.containerSelector).find('.vote-button').removeClass('voted').text('Голосовать');
        $('#submit-votes-panel').addClass('hidden');
    }

    // Стили для переключателя режимов
    _injectModeToggleStyles() {
        if ($('#mode-toggle-styles').length) return;

        $('head').append(`
            <style id="mode-toggle-styles">
                .voting-mode-toggle {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 10px 15px;
                    background: #1a1a1a;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    border: 1px solid #333;
                }

                .mode-label {
                    color: #888;
                    font-size: 14px;
                }

                .mode-switch-container {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .mode-option {
                    color: #fff;
                    font-size: 14px;
                }

                .mode-switch {
                    position: relative;
                    display: inline-block;
                    width: 50px;
                    height: 26px;
                }

                .mode-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .mode-switch .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ff0055;
                    transition: 0.3s;
                    border-radius: 26px;
                }

                .mode-switch .slider:before {
                    position: absolute;
                    content: "";
                    height: 20px;
                    width: 20px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }

                .mode-switch input:checked + .slider {
                    background-color: #666;
                }

                .mode-switch input:checked + .slider:before {
                    transform: translateX(24px);
                }

                .voting-locked-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 9998;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .voting-locked-message {
                    background: #1a1a1a;
                    padding: 30px 50px;
                    border-radius: 15px;
                    text-align: center;
                    border: 2px solid #00ff88;
                }

                .voting-locked-message h3 {
                    color: #00ff88;
                    margin-bottom: 10px;
                }

                .voting-locked-message p {
                    color: #888;
                }
            </style>
        `);
    }

    _monkeyPatchPlayer() {
        const self = this;

        // Добавляем нативный перехватчик на каждую track-card с capture: true
        $(this.containerSelector).find('.track-card').each(function() {
            const card = this;

            // Защита от повторной установки обработчиков
            if (card._votingClickInterceptorAttached) {
                return;
            }

            const clickInterceptor = function(e) {
                // Игнорируем если в старом режиме
                if (isOld) {
                    return;
                }

                // Проверяем клик по badge
                const badge = e.target.closest('.rank-badge');

                if (badge) {
                    // Блокируем распространение к плееру
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    if (isDebug) {
                        console.log('[Card Interceptor] Перехвачен клик по badge');
                    }

                    // Обрабатываем переключение voted
                    const $badge = $(badge);
                    const $card = $badge.closest('.track-card');
                    const trackUid = $card.data('uid');
                    const track = self.tracks.find(t => t.uid === trackUid);

                    if (track) {
                        const wasVoted = track.voted;
                        track.voted = !track.voted;

                        if (isDebug) {
                            console.log(`[Card Interceptor] ${track.title}: ${wasVoted} → ${track.voted}`);
                        }

                        self._updateRankings();
                    }

                    return false;
                }

                // Блокируем клики по listen-indicator (только для UI, без логики)
                const indicator = e.target.closest('.listen-indicator');
                if (indicator) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }
            };

            // Нативный addEventListener с capture: true - сработает РАНЬШЕ jQuery обработчиков
            card.addEventListener('click', clickInterceptor, true);
            card._votingClickInterceptorAttached = true;
        });

        if (isDebug) {
            console.log('[MonkeyPatch] Установлены нативные перехватчики на', $(this.containerSelector).find('.track-card').length, 'карточек');
        }
    }

    _initialSort() {
        // Берем карточки в том порядке, в котором они есть в DOM (отсортированы выше по лайкам и т.д.)
        // Если есть сохраненное состояние - применяем его
        const savedState = this._loadVotingState();

        if (savedState && savedState.cardOrder && savedState.cardOrder.length > 0) {
            // Восстанавливаем порядок из localStorage
            this._setCardOrder(savedState.cardOrder);
        }
        // Если нет сохраненного состояния - оставляем как есть в DOM
    }

    _setupDragAndDrop() {
        const container = document.querySelector(this.containerSelector);
        const self = this;
        if (!container) return;

        if (this.sortableInstance) return;

        $(this.containerSelector).find('.track-card').css('cursor', 'grab');
        this._injectMinimalStyles();

        this.sortableInstance = Sortable.create(container, {
            animation: 150,
            handle: '.track-card',
            filter: '.my-track',
            onStart: function(evt) {
                // Mark track as voted when dragging starts
                const $card = $(evt.item);
                const trackUid = $card.data('uid');
                const track = self.tracks.find(t => t.uid === trackUid);
                if (track) {
                    track.voted = true;
                }
            },
            onEnd: function(evt) {
                self._updateRankings();
                self._setPlayerPlayList();
            }
        });
    }

    _initializeVotedFlags() {
        // Initialize voted flag for all tracks
        this.tracks.forEach(track => {
            if (!track.hasOwnProperty('voted')) {
                track.voted = false;
            }
        });
    }


    _updateRankings() {
        const $cards = $(this.containerSelector).find('.track-card');
        let currentPlace = 1;
        this.votes = {}; // Reset votes and rebuild based on voted tracks only
        const self = this;

        $cards.each(function() {
            const $card = $(this);
            const trackUid = $card.data('uid');
            const trackUserId = parseInt($card.data('userid'), 10);
            const track = self.tracks.find(t => t.uid === trackUid);

            let $badge = $card.find('.rank-badge');

            if ($badge.length === 0) {
                $badge = $('<div>').addClass('rank-badge');
                $card.append($badge);
            }

            if (trackUserId === self.user.id) {
                $card.addClass('my-track');
                $badge.removeClass('visible voted non-voted prize non-prize').hide();
                return;
            }

            $card.find('.vote-button').remove(); // Ensure buttons are gone in Desktop mode

            // Determine if this place is a prize place
            const isPrize = currentPlace <= self.MAX_VOTES;

            // Set badge number and classes
            $badge.text(currentPlace).addClass('visible').show();
            $badge.removeClass('voted non-voted prize non-prize');

            if (track && track.voted) {
                $badge.addClass('voted');
                if (isPrize) {
                    $badge.addClass('prize');
                    self.votes[trackUid] = currentPlace;
                } else {
                    $badge.addClass('non-prize');
                }
                if (isDebug) {
                    console.log(`[_updateRankings] Track ${currentPlace}: ${track.title} - voted ${isPrize ? 'prize' : 'non-prize'}`);
                }
            } else {
                $badge.addClass('non-voted');
                if (isPrize) {
                    $badge.addClass('prize');
                } else {
                    $badge.addClass('non-prize');
                }
                if (isDebug && track) {
                    console.log(`[_updateRankings] Track ${currentPlace}: ${track.title} - non-voted ${isPrize ? 'prize' : 'non-prize'}`);
                }
            }

            currentPlace++;
        });

        this._updateSubmitButtonState();

        // Сохраняем состояние при каждом изменении рейтинга
        this._saveVotingState();
    }

    _renderSubmitControl() {
        $('#submit-votes-panel').remove();
        const $panel = $('<div>').attr('id', 'submit-votes-panel').addClass('submit-votes-panel hidden');
        const $info = $('<span>').addClass('vote-count-info').text(`Расставьте топ-${this.MAX_VOTES}`);
        const $btn = $('<button>').addClass('submit-btn').attr('disabled', true).text('Подтвердить голоса');
        $panel.append($info).append($btn);
        $('body').append($panel);

        $btn.on('click', () => this.showResultsModal());
    }

    _updateSubmitButtonState() {
        const votesCount = Object.keys(this.votes).length;
        const $panel = $('#submit-votes-panel');
        const $btn = $panel.find('.submit-btn');

        // Проверяем, что места от 1 до MAX_VOTES заняты
        const places = Object.values(this.votes).sort((a, b) => a - b);
        const hasAllPlaces = places.length === this.MAX_VOTES &&
                            places.every((place, index) => place === index + 1);

        if (votesCount > 0) {
            $panel.removeClass('hidden');
            $panel.find('.vote-count-info').text(`Выбрано: ${votesCount} из ${this.MAX_VOTES}`);

            // Кнопка активна только если все места от 1 до MAX_VOTES расставлены
            if (hasAllPlaces) {
                $btn.prop('disabled', false);
            } else {
                $btn.prop('disabled', true);
            }
        } else {
            $panel.addClass('hidden');
        }
    }

    _setupPlayerListeners() {
        if (!this.player) {
            if (isDebug) console.log('[VotingSystem] Player not found');
            return;
        }

        const self = this;

        if (isDebug) {
            console.log('[VotingSystem] Setting up player listeners');
            console.log('[VotingSystem] Player object:', this.player);
            console.log('[VotingSystem] Player has audioTrack?', !!this.player.audioTrack);
            console.log('[VotingSystem] Player has currentTrack?', !!this.player.currentTrack);
        }

        // Плеер использует this.player.audioTrack (HTML5 Audio элемент)
        // и this.player.currentTrack (объект с данными трека)
        if (this.player.audioTrack && this.player.audioTrack instanceof HTMLAudioElement) {
            if (isDebug) console.log('[VotingSystem] Attaching to audioTrack events');

            // Слушаем событие timeupdate для отслеживания прогресса
            this.player.audioTrack.addEventListener('timeupdate', function() {
                if (!self.player.currentTrack || !self.player.currentTrack.uid) return;

                const currentUid = self.player.currentTrack.uid;
                const track = self.tracks.find(t => t.uid === currentUid);

                if (!track) return;

                const currentTime = self.player.audioTrack.currentTime;
                const duration = self.player.audioTrack.duration;

                if (duration && !isNaN(duration) && duration > 0) {
                    const progressPercent = Math.min(100, Math.floor((currentTime / duration) * 100));

                    // Обновляем только если прогресс увеличился
                    if (progressPercent > track.listenProgress) {
                        track.listenProgress = progressPercent;
                        self._updateListenIndicator(track);

                        if (isDebug && progressPercent % 10 === 0) {
                            console.log(`[VotingSystem] Progress ${track.title}: ${progressPercent}%`);
                        }
                    }
                }
            });

            if (isDebug) console.log('[VotingSystem] Player listener attached successfully');
        } else {
            console.warn('[VotingSystem] audioTrack not found or not an HTMLAudioElement');
        }
    }

    _updateListenIndicator(track) {
        const $card = $(track.element);
        let $indicator = $card.find('.listen-indicator');

        // Создаем индикатор если его нет
        if ($indicator.length === 0) {
            $indicator = $('<div>').addClass('listen-indicator');
            $indicator.html('<div class="listen-percent">0%</div>');
            $card.append($indicator);
        }

        // Обновляем прогресс
        const progress = track.listenProgress;

        // Определяем цвет в зависимости от прогресса
        let colorClass = 'low';

        if (progress >= 60) {
            colorClass = 'high'; // Ярко-зеленый (60-100%)
        } else if (progress >= 30) {
            colorClass = 'medium'; // Желтый (30-60%)
        }

        // Показываем индикатор
        $indicator.addClass('visible');

        // Обновляем процент с цветом
        const $percent = $indicator.find('.listen-percent');
        $percent.removeClass('low medium high').addClass(colorClass);
        $percent.text(progress + '%');

        // Сохраняем прогресс
        this._saveListenProgress();
    }

    _initializeListenIndicators() {
        // Initialize listen indicators for all tracks on page load
        // Проверяем localStorage для восстановления прогресса
        const savedProgress = this._loadListenProgress();

        this.tracks.forEach(track => {
            // Восстанавливаем сохраненный прогресс
            if (savedProgress[track.uid]) {
                track.listenProgress = savedProgress[track.uid];
            }

            if (track.listenProgress > 0) {
                this._updateListenIndicator(track);
            }
        });
    }

    _loadListenProgress() {
        // Загружаем из общего состояния голосования
        const savedState = this._loadVotingState();
        return savedState && savedState.listenProgress ? savedState.listenProgress : {};
    }

    _saveListenProgress() {
        // Сохраняем прогресс в общее состояние голосования
        this._saveVotingState();
    }

    // --- НОВЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ОБЩИМ СОСТОЯНИЕМ ГОЛОСОВАНИЯ ---

    // Загрузка состояния голосования из localStorage
    _loadVotingState() {
        try {
            const saved = localStorage.getItem(this.votingStateKey);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('[VotingSystem] Error loading voting state:', e);
            return null;
        }
    }

    // Сохранение состояния голосования в localStorage
    _saveVotingState() {
        try {
            // Собираем текущий порядок карточек
            const cardOrder = this._getCurrentCardOrder();

            // Собираем отметки voted
            const votedFlags = {};
            this.tracks.forEach(track => {
                if (track.voted) {
                    votedFlags[track.uid] = true;
                }
            });

            // Собираем прогресс прослушивания
            const listenProgress = {};
            this.tracks.forEach(track => {
                if (track.listenProgress > 0) {
                    listenProgress[track.uid] = track.listenProgress;
                }
            });

            // Формируем объект состояния
            const state = {
                cardOrder: cardOrder,
                votedFlags: votedFlags,
                listenProgress: listenProgress,
                timestamp: Date.now()
            };

            localStorage.setItem(this.votingStateKey, JSON.stringify(state));
        } catch (e) {
            console.error('[VotingSystem] Error saving voting state:', e);
        }
    }

    // Загрузка и восстановление состояния голосования
    _loadAndRestoreVotingState() {
        const savedState = this._loadVotingState();

        if (!savedState) return;

        // Восстанавливаем отметки voted
        if (savedState.votedFlags) {
            this.tracks.forEach(track => {
                track.voted = savedState.votedFlags[track.uid] || false;
            });
        }

        // Восстанавливаем прогресс прослушивания
        if (savedState.listenProgress) {
            this.tracks.forEach(track => {
                track.listenProgress = savedState.listenProgress[track.uid] || 0;
            });
        }
    }

    // Очистка состояния голосования из localStorage
    _clearVotingState() {
        try {
            localStorage.removeItem(this.votingStateKey);

            // Также удаляем старый ключ прослушанности, если он есть
            localStorage.removeItem('votingSystem_listenProgress');
        } catch (e) {
            console.error('[VotingSystem] Error clearing voting state:', e);
        }
    }

    // Получение текущего порядка карточек
    _getCurrentCardOrder() {
        const $cards = $(this.containerSelector).find('.track-card');
        const order = [];

        $cards.each(function() {
            const uid = $(this).data('uid');
            if (uid) {
                order.push(uid);
            }
        });

        return order;
    }

    // Установка порядка карточек программно
    _setCardOrder(uidArray) {
        if (!uidArray || uidArray.length === 0) return;

        const $container = $(this.containerSelector);
        const cardsByUid = {};

        // Индексируем карточки по uid
        $container.find('.track-card').each(function() {
            const uid = $(this).data('uid');
            if (uid) {
                cardsByUid[uid] = this;
            }
        });

        // Перестраиваем порядок согласно массиву
        const orderedCards = [];
        uidArray.forEach(uid => {
            if (cardsByUid[uid]) {
                orderedCards.push(cardsByUid[uid]);
                delete cardsByUid[uid]; // Удаляем из объекта, чтобы не добавить дважды
            }
        });

        // Добавляем карточки, которых не было в сохраненном порядке (новые карточки)
        Object.values(cardsByUid).forEach(card => {
            orderedCards.push(card);
        });

        // Применяем новый порядок в DOM
        $container.append(orderedCards);
    }


    _injectMinimalStyles() {
        if (!$('#ranking-styles').length) {
            $('head').append(`
                <style id="ranking-styles">
                    .rank-badge {
                        position: absolute; top: -10px; left: -10px; width: 40px; height: 40px;
                        color: white; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center;
                        font-weight: bold; font-size: 18px; z-index: 10;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white;
                        display: none;
                        transition: all 0.3s ease;
                    }
                    .rank-badge.visible { display: flex; }

                    /* Voted + Prize = Красный яркий */
                    .rank-badge.voted.prize {
                        background: #ff0055;
                        opacity: 1;
                        pointer-events: auto;
                        cursor: pointer;
                        border-color: white;
                    }

                    /* Voted + Non-Prize = Серый яркий */
                    .rank-badge.voted.non-prize {
                        background: #666666;
                        opacity: 1;
                        pointer-events: auto;
                        cursor: pointer;
                        border-color: white;
                    }

                    /* Non-Voted + Prize = Красный полупрозрачный */
                    .rank-badge.non-voted.prize {
                        background: #ff0055;
                        opacity: 0.4;
                        pointer-events: auto;
                        cursor: pointer;
                        border-color: rgba(255, 255, 255, 0.5);
                    }

                    /* Non-Voted + Non-Prize = Серый полупрозрачный */
                    .rank-badge.non-voted.non-prize {
                        background: #666666;
                        opacity: 0.4;
                        pointer-events: auto;
                        cursor: pointer;
                        border-color: rgba(255, 255, 255, 0.5);
                    }

                    .rank-badge.non-voted:hover {
                        opacity: 0.7;
                        transform: scale(1.1);
                    }

                    .track-card.my-track { opacity: 0.6; border: 1px dashed #666; }

                    /* Listen Indicator - Text Only */
                    .listen-indicator {
                        position: absolute;
                        top: 6px;
                        right: 6px;
                        z-index: 11;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                        pointer-events: none;
                    }

                    .listen-indicator.visible {
                        opacity: 1;
                    }

                    .listen-indicator .listen-percent {
                        font-size: 11px;
                        font-weight: bold;
                        line-height: 1;
                        padding: 3px 6px;
                        border-radius: 3px;
                        background: rgba(0, 0, 0, 0.7);
                        transition: color 0.3s ease;
                    }

                    /* Цветовые классы для процентов */
                    .listen-indicator .listen-percent.low {
                        color: #999;
                    }

                    .listen-indicator .listen-percent.medium {
                        color: #ffcc00;
                    }

                    .listen-indicator .listen-percent.high {
                        color: #00ff88;
                    }

                    .submit-votes-panel {
                        position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
                        background: #1a1a1a; padding: 15px 30px; border-radius: 50px;
                        z-index: 9999; display: flex; gap: 15px; align-items: center; border: 1px solid #333;
                    }
                    .submit-votes-panel.hidden { display: none; }
                    .submit-btn {
                        background: #ff0055; color: white; border: none;
                        padding: 10px 20px; border-radius: 20px; cursor: pointer;
                        transition: all 0.3s ease;
                    }
                    .submit-btn:disabled {
                        background: #555555;
                        cursor: not-allowed;
                        opacity: 0.5;
                    }
                    .submit-btn:not(:disabled):hover {
                        background: #ff3377;
                        transform: scale(1.05);
                    }
                    .vote-count-info { color: white; }
                </style>
            `);
        }
    }

    _setPlayerPlayList() {
        if (this._updateTimeout) clearTimeout(this._updateTimeout);
        
        this._updateTimeout = setTimeout(() => {
            const container = this.containerSelector;
            const $cards = $(container).find('.track-card');
            const newList = [];

            $cards.each(function() {
                const $el = $(this);
                const trackData = {
                    uid: $el.data('uid'),
                    id: $el.data('uid'),
                    title: $el.data('title'),
                    artist: $el.data('artist'),
                    file: $el.data('audio') || $el.data('url'), 
                    cover: $el.data('cover'),
                    duration: $el.data('duration'),
                    genre: $el.data('genre'),
                };
                
                newList.push({
                    data: trackData,
                    $el: $el
                });
            });

            if (this.player) {
                // Check if playlist exists, if not initialize it lightly
                if (!this.player.playlists[container]) {
                     this.player.playlists[container] = { list: [] };
                }
                
                this.player.playlists[container].list = newList;
                if (typeof this.player._resyncPlaylistIndexes === 'function') {
                    this.player._resyncPlaylistIndexes(container);
                }
                
                if (this.player.currentPlaylist === container && this.player.currentTrack) {
                    const newIndex = newList.findIndex(item => item.data.uid === this.player.currentTrack.uid);
                    if (this.player.playlists[container]) {
                        this.player.playlists[container].currentIndex = newIndex !== -1 ? newIndex : -1;
                    }
                }
            }
        }, 50);
    }

    // --- RESULT MODALS DISPATCHER ---

    showResultsModal() {
        if (isOld) {
            this._showResultsModalOld();
        } else {
            this._showResultsModalNew();
        }
    }

    // New System Modal (Desktop)
    _showResultsModalNew() {
        const sortedVotes = Object.entries(this.votes).sort((a, b) => a[1] - b[1]);
        
        const $modal = $('<div>').addClass('modal-overlay modal-results');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('Результаты голосования');
        const $votesContainer = $('<div>').addClass('sortable-container');
        
        sortedVotes.forEach(([trackUid, place]) => {
            const track = this.tracks.find(t => t.uid === trackUid);
            if (!track) return;
            
            const $item = $('<div>')
                .addClass('sortable-item')
                .attr('data-track-uid', trackUid)
                .attr('data-place', place);
            
            const $itemContent = $('<div>').addClass('sortable-item-content');
            const $placeCircle = $('<span>').addClass('place-circle').text(place);
            const $trackInfo = $('<span>').addClass('track-info-text')
                .html(`<span class="track-title text-black">${track.artist} — ${track.title}</span>`);

            $itemContent.append($placeCircle).append($trackInfo);
            $item.append($itemContent);
            $votesContainer.append($item);
        });
        
        const $buttonContainer = $('<div>').addClass('modal-actions');
        const $confirmButton = $('<button>').addClass('confirm-button').text('Подтвердить и отправить');
        const $cancelButton = $('<button>').addClass('cancel-button').text('Вернуться');
        
        $buttonContainer.append($confirmButton).append($cancelButton);
        $modalContent.append($heading).append($votesContainer).append($buttonContainer);
        $modal.append($modalContent);
        $('body').append($modal);
        
        const self = this;
        
        $confirmButton.on('click', function() {
            self.sendVote(sortedVotes);
            $modal.remove();
            $('#submit-votes-panel').addClass('hidden'); 
        });
        
        $cancelButton.on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }

    // Old System Modal
    _showResultsModalOld() {
        const sortedVotes = Object.entries(this.votes).sort((a, b) => a[1] - b[1]);
        
        const $modal = $('<div>').addClass('modal-overlay modal-results');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('Результаты голосования');
        const $votesContainer = $('<div>').addClass('sortable-container');
        
        sortedVotes.forEach(([trackUid, place]) => {
            const track = this.tracks.find(t => t.uid === trackUid);
            if (!track) return;
            
            const $item = $('<div>')
                .addClass('sortable-item')
                .attr('draggable', true) // In old system this was draggable but on mobile drag might be tricky, staying faithful to old code
                .attr('data-track-uid', trackUid)
                .attr('data-place', place);
            
            const $itemContent = $('<div>').addClass('sortable-item-content');
            const $placeCircle = $('<span>').addClass('place-circle').text(place);
            const $trackInfo = $('<span>').addClass('track-info-text')
                .html(`<div class="text-pink marquee-container">
                    <span class="track-title text-black marquee-text">${track.artist} — ${track.title}</span></div>`);
            
            // Marquee initialization if available
            const $titleContainer = $trackInfo;
            if (typeof $titleContainer.marquee === 'function') {
                $titleContainer.data('marquee-initialized', false).marquee();
            }

            $itemContent.append($placeCircle).append($trackInfo);
            const $dragHandle = $('<div>').addClass('drag-handle').html('<i class="las la-arrows-alt-v"></i>');
            $item.append($itemContent).append($dragHandle);
            $votesContainer.append($item);
        });

        // Initialize Sortable for re-ordering in modal (Old system feature)
        if (typeof Sortable !== 'undefined') {
            Sortable.create($votesContainer[0], {
                handle: '.drag-handle',
                animation: 150,
                onEnd: function () {
                    $votesContainer.find('.sortable-item').each(function(index) {
                        $(this).find('.place-circle').text(index + 1);
                        $(this).attr('data-place', index + 1);
                    });
                }
            });
        }

        const $buttonContainer = $('<div>').addClass('modal-actions');
        const $confirmButton = $('<button>').addClass('confirm-button').text('Подтвердить');
        const $cancelButton = $('<button>').addClass('cancel-button').text('Отменить');
        
        $buttonContainer.append($confirmButton).append($cancelButton);
        $modalContent.append($heading).append($votesContainer).append($buttonContainer);
        $modal.append($modalContent);
        $('body').append($modal);
        
        const self = this;
        
        $confirmButton.on('click', function() {
            const updatedVotes = self._collectSortedVotes($votesContainer);
            self._updateVotesFromSortedList(updatedVotes);
            $modal.remove();
            self.showConfirmModal(updatedVotes);
        });
        
        $cancelButton.on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }

    _collectSortedVotes($container) {
        const updatedVotes = [];
        $container.find('.sortable-item').each(function(index) {
            const trackUid = $(this).data('track-uid');
            const place = index + 1;
            updatedVotes.push([trackUid, place]);
        });
        return updatedVotes;
    }

    _updateVotesFromSortedList(sortedVotes) {
        this.votes = {};
        sortedVotes.forEach(([trackUid, place]) => {
            this.votes[trackUid] = place;
        });
        this._renderVoteButtons(); // Refresh UI
    }

    showConfirmModal(sortedVotes) {
        const self = this;
        const $modal = $('<div>').addClass('modal-overlay');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('Подтвердите голос');
        const $message = $('<p>').addClass('modal-message').text('Вы действительно хотите отправить голоса?');
        const $buttonContainer = $('<div>').addClass('modal-actions');
        const $confirmButton = $('<button>').addClass('confirm-button').text('Да');
        const $cancelButton = $('<button>').addClass('cancel-button').text('Нет');
        
        $buttonContainer.append($confirmButton).append($cancelButton);
        $modalContent.append($heading).append($message).append($buttonContainer);
        $modal.append($modalContent);
        $('body').append($modal);
        
        $confirmButton.on('click', function() {
            self.sendVote(sortedVotes);
            $modal.remove();
        });
        
        $cancelButton.on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }
}

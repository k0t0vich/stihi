// DEBUG & CONFIG
const isDebug = false;

function detectIsMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

// Всегда используем новый режим
const isOld = false; // Всегда новый режим

class VotingSystem {
    constructor(player, containerSelector, { user = null, eventUid = null, tourUid = null, voitedCount = 10 } = {}) {

        console.log("VotingSystem 2.1-1");
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

        this.init();
    }

    init() {
        this._collectTracks();

        // Permission check serves as a gatekeeper
        const canVote = this._checkPermissions();
        if (!canVote) {
            // Если не можем голосовать - полностью останавливаем инициализацию
            return;
        }

        // Всегда используем новый режим
        this._init();
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

        // Загружаем и восстанавливаем состояние из localStorage
        this._loadAndRestoreVotingStateOld();

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
        console.log('[_init] Инициализация нового режима');
        this._injectModeToggleStyles(); // Инжектим стили (включая стили для модалок)
        this._loadAndRestoreVotingState(); // Загружаем и восстанавливаем состояние из localStorage
        this._initialSort(); // Устанавливаем порядок карточек
        this._setupDragAndDrop();
        this._initializeVotedFlags(); // Initialize voted flags
        this._renderVoteButtonsNew(); // Настраиваем кнопки
        this._bindVoteButtonClicksNew(); // Привязываем обработчики кликов
        this._updateRankings();
        this._monkeyPatchPlayer(); // Патчим плеер ПОСЛЕ создания badge
        this._setPlayerPlayList();
        this._setupPlayerListeners(); // Listen for play events
        this._initializeListenIndicators(); // Initialize listen progress indicators
        console.log('[_init] Инициализация нового режима завершена');
    }

    // Рендеринг переключателя режимов для десктопа
    _renderModeToggle() {
        $('#voting-mode-toggle').remove();

        const $toggle = $('<div>').attr('id', 'voting-mode-toggle').addClass('voting-mode-toggle');
        const $label = $('<span>').addClass('mode-label').text('Режим голосования:');

        const $switchContainer = $('<div>').addClass('mode-switch-container');
        const $newLabel = $('<span>').addClass('mode-option').text('Таскать');
        const $switch = $('<label>').addClass('mode-switch');
        const $checkbox = $('<input>').attr('type', 'checkbox').prop('checked', isOld);
        const $slider = $('<span>').addClass('slider');
        $switch.append($checkbox).append($slider);
        const $oldLabel = $('<span>').addClass('mode-option').text('Выбирать');

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

        // Сохраняем выбор
        this._saveModePreference(useOldMode);

        // Сохраняем текущее состояние перед переключением
        this._saveVotingState();

        // Конвертируем данные между режимами
        if (useOldMode) {
            // Переключаемся с нового на старый режим
            this._convertNewToOld();
        } else {
            // Переключаемся со старого на новый режим
            this._convertOldToNew();
        }

        // Обновляем глобальную переменную режима
        isOld = useOldMode;

        // Применяем новый режим без перезагрузки
        this._applyModeSwitch(useOldMode);
    }

    // Применение переключения режима без перезагрузки страницы
    _applyModeSwitch(useOldMode) {
        console.log(`[_applyModeSwitch] Переключение на ${useOldMode ? 'СТАРЫЙ' : 'НОВЫЙ'} режим`);
        const $container = $(this.containerSelector);

        if (useOldMode) {
            // Переключаемся на старый режим
            console.log('[_applyModeSwitch] Настройка старого режима');

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

            // Настраиваем кнопки для старого режима
            this._renderVoteButtons();
            this._bindVoteButtonClicks();
            this._checkAndRenderResultsButton();
        } else {
            // Переключаемся на новый режим
            console.log('[_applyModeSwitch] Настройка нового режима');

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

            // Панель подтверждения больше не нужна
            // this._renderSubmitControl();
            this._initializeVotedFlags();

            // Настраиваем кнопки для нового режима
            this._renderVoteButtonsNew();
            this._bindVoteButtonClicksNew();

            this._updateRankings();

            // Устанавливаем перехватчики кликов для badge (если ещё не установлены)
            this._monkeyPatchPlayer();
        }

        console.log('[_applyModeSwitch] Переключение завершено');
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

                /* Стили для модалки выбора места (НОВЫЙ РЕЖИМ) */

                /* Текущее место этого трека - зелёный фон */
                .place-button.current {
                    border: 3px solid #00ff88;
                    background: #00ff88;
                    color: #000;
                    font-weight: bold;
                }

                /* Занятое другим треком место - зелёный фон */
                .place-button.occupied {
                    border: 2px solid #00aa55;
                    background: #00aa55;
                    color: #000;
                    position: relative;
                }

                .place-button.occupied::after {
                    content: '✓';
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    font-size: 10px;
                    color: #000;
                }

                /* Кнопка OUT */
                .place-button.out-button {
                    background: #ff0055;
                    color: white;
                    font-weight: bold;
                    border: 2px solid #ff0055;
                }

                .place-button.out-button:hover {
                    background: #ff3377;
                    border-color: #ff3377;
                }

                /* Drag handle для модального окна сортировки */
                .drag-handle {
                    cursor: grab;
                    font-size: 24px;
                    color: #888;
                    padding: 5px 10px;
                    user-select: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .drag-handle:active {
                    cursor: grabbing;
                }

                .drag-handle:hover {
                    color: #fff;
                }

                .sortable-item {
                    cursor: grab;
                }

                .sortable-item:active {
                    cursor: grabbing;
                }

                /* Компактные стили для финальной модалки сортировки */
                .sortable-container {
                    min-height: 300px;
                    max-height: 500px;
                    gap: 2px;
                    margin-bottom: 4px;
                }

                .sortable-container:has(> .sortable-item:nth-child(11)) {
                    overflow-y: auto;
                }

                .sortable-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 4px 4px;
                    margin-bottom: 0;
                    background: #f5f5f5;
                    border-radius: 0;
                }

                .sortable-item-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                }

                /*.place-circle {*/
                /*    display: inline-block;*/
                /*    min-width: 20px;*/
                /*    color: #000;*/
                /*    font-weight: bold;*/
                /*    font-size: 14px;*/
                /*    background: none !important;*/
                /*    border: none !important;*/
                /*    border-radius: 0 !important;*/
                /*}*/

                .track-info-text {
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.2;
                }

                .drag-handle {
                    padding: 2px 4px;
                    font-size: 20px;
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

                    // Проверяем, находится ли трек в пределах MAX_VOTES
                    const currentOrder = self._getCurrentCardOrder();
                    const currentPlace = currentOrder.indexOf(trackUid) + 1; // 1-based
                    const isPrize = currentPlace <= self.MAX_VOTES;

                    if (track && isPrize) {
                        // Переключаем voted только для треков в пределах TOP
                        const wasVoted = track.voted;
                        track.voted = !track.voted;

                        if (isDebug) {
                            console.log(`[Card Interceptor] ${track.title}: ${wasVoted} → ${track.voted}`);
                        }

                        self._updateRankings();
                    } else {
                        if (isDebug) {
                            console.log(`[Card Interceptor] Клик проигнорирован - трек за пределами TOP-${self.MAX_VOTES}`);
                        }
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
        console.log('[_initialSort] Начало сортировки');
        // Берем карточки в том порядке, в котором они есть в DOM (отсортированы выше по лайкам и т.д.)
        // Если есть сохраненное состояние - применяем его
        const savedState = this._loadVotingState();

        if (savedState && savedState.cardOrder && savedState.cardOrder.length > 0) {
            // Восстанавливаем порядок из localStorage
            console.log('[_initialSort] Восстанавливаем порядок из localStorage');
            this._setCardOrder(savedState.cardOrder);
        } else {
            // Если нет сохраненного состояния - помещаем свой трек в конец
            console.log('[_initialSort] Нет сохраненного состояния, помещаем свой трек в конец');
            this._moveOwnTrackToEnd();
        }
    }

    // Перемещает свой трек в конец списка
    _moveOwnTrackToEnd() {
        const currentOrder = this._getCurrentCardOrder();
        const ownTrack = this.tracks.find(t => parseInt(t.userId, 10) === this.user.id);

        if (!ownTrack) {
            console.log('[_moveOwnTrackToEnd] Свой трек не найден');
            return;
        }

        console.log('[_moveOwnTrackToEnd] Свой трек найден:', ownTrack.uid);

        // Удаляем свой трек из текущей позиции
        const newOrder = currentOrder.filter(uid => uid !== ownTrack.uid);
        // Добавляем в конец
        newOrder.push(ownTrack.uid);

        console.log('[_moveOwnTrackToEnd] Новый порядок:', newOrder);
        this._setCardOrder(newOrder);
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
            filter: '.my-track', // Запрещаем перетаскивать свой трек
            onStart: function(evt) {
                // Mark track as voted when dragging starts
                const $card = $(evt.item);
                const trackUid = $card.data('uid');
                const track = self.tracks.find(t => t.uid === trackUid);
                if (track) {
                    track.voted = true;
                }
            },
            onMove: function(evt) {
                // Запрещаем перетаскивать на последнюю позицию (где свой трек)
                const relatedElement = evt.related;
                const $related = $(relatedElement);
                const relatedUserId = parseInt($related.data('userid'), 10);

                // Если пытаемся переместить на место своего трека - запрещаем
                if (relatedUserId === self.user.id) {
                    console.log('[DnD] Запрещено перемещение на место своего трека');
                    return false; // Отменяем перемещение
                }

                return true; // Разрешаем перемещение
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

    // --- НОВЫЙ РЕЖИМ: МОДАЛЬНОЕ ОКНО ДЛЯ ВЫБОРА МЕСТА ---

    _renderVoteButtonsNew() {
        console.log('[_renderVoteButtonsNew] Начало рендеринга кнопок для нового режима');
        const $container = $(this.containerSelector);

        this.tracks.forEach(track => {
            // Пропускаем свой трек
            if (parseInt(track.userId, 10) === this.user.id) {
                return;
            }

            // Ищем существующую кнопку .vote-button
            let $voteButton = $(track.element).find('.vote-button');

            console.log(`[_renderVoteButtonsNew] Track ${track.uid}: найдено кнопок .vote-button - ${$voteButton.length}, voted=${track.voted}`);

            if ($voteButton.length === 0) {
                // Если кнопки нет - создаем
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
                console.log(`[_renderVoteButtonsNew] Создана новая кнопка для трека ${track.uid}`);
            }

            // В новом режиме всегда показываем "Выбрать место"
            $voteButton.text('Выбрать место');
            $voteButton.show(); // Убеждаемся что кнопка видима

            // Меняем цвет кнопки в зависимости от состояния voted
            if (track.voted) {
                $voteButton.addClass('voted'); // Зеленый цвет
                console.log(`[_renderVoteButtonsNew] Кнопка трека ${track.uid} отмечена как voted (зеленая)`);
            } else {
                $voteButton.removeClass('voted'); // Обычный цвет
                console.log(`[_renderVoteButtonsNew] Кнопка трека ${track.uid} не отмечена (обычная)`);
            }

            console.log(`[_renderVoteButtonsNew] Кнопка для трека ${track.uid} настроена: "${$voteButton.text()}"`);
        });

        console.log('[_renderVoteButtonsNew] Рендеринг завершен');
    }

    // Только обновление цвета кнопок без пересоздания
    _updateVoteButtonsColor() {
        const currentOrder = this._getCurrentCardOrder();

        this.tracks.forEach(track => {
            // Пропускаем свой трек
            if (parseInt(track.userId, 10) === this.user.id) {
                return;
            }

            // Ищем существующую кнопку .vote-button
            const $voteButton = $(track.element).find('.vote-button');

            if ($voteButton.length === 0) return;

            // Проверяем, находится ли трек в пределах TOP
            const currentPlace = currentOrder.indexOf(track.uid) + 1;
            const isPrize = currentPlace <= this.MAX_VOTES;

            // Меняем цвет кнопки только для треков в пределах TOP
            if (track.voted && isPrize) {
                $voteButton.addClass('voted'); // Зеленый цвет
            } else {
                $voteButton.removeClass('voted'); // Обычный цвет
            }
        });
    }

    _bindVoteButtonClicksNew() {
        console.log('[_bindVoteButtonClicksNew] Привязка обработчиков для нового режима');
        const self = this;

        // Отвязываем старые обработчики
        $('body').off('click', `${this.containerSelector} .vote-button`);

        // Привязываем новый обработчик для нового режима
        $('body').on('click', `${this.containerSelector} .vote-button`, function(e) {
            // Проверяем, что мы в новом режиме
            if (isOld) {
                console.log('[_bindVoteButtonClicksNew] Клик проигнорирован - активен старый режим');
                return; // Не обрабатываем в старом режиме
            }

            e.preventDefault();
            e.stopPropagation();

            const $card = $(this).closest('.track-card');
            const trackUid = $card.data('uid');

            console.log(`[_bindVoteButtonClicksNew] Клик по кнопке трека ${trackUid}`);

            // Открываем модалку выбора места для нового режима
            self._openVoteModalNew($card, trackUid);
        });

        console.log('[_bindVoteButtonClicksNew] Обработчики привязаны');
    }

    _openVoteModalNew($card, trackUid) {
        const self = this;
        const $modal = this._createVoteModalNew(trackUid);
        $('body').append($modal);

        $modal.find('[data-place]').on('click', function() {
            const place = $(this).data('place');
            const track = self.tracks.find(t => t.uid === trackUid);

            if (!track) {
                $modal.remove();
                return;
            }

            // Получаем текущий порядок карточек
            const currentOrder = self._getCurrentCardOrder();
            const currentPlace = currentOrder.indexOf(trackUid) + 1; // 1-based

            if (place === 'out') {
                // Кнопка OUT - перемещаем трек на ПРЕДПОСЛЕДНЕЕ место (перед своим треком) с отметкой voted
                track.voted = true;

                // Находим свой трек
                const ownTrack = self.tracks.find(t => parseInt(t.userId, 10) === self.user.id);

                // Удаляем перемещаемый трек из текущей позиции
                const newOrder = currentOrder.filter(uid => uid !== trackUid);

                if (ownTrack) {
                    // Находим позицию своего трека в новом порядке
                    const ownTrackIndex = newOrder.indexOf(ownTrack.uid);
                    if (ownTrackIndex !== -1) {
                        // Вставляем перед своим треком (предпоследняя позиция)
                        newOrder.splice(ownTrackIndex, 0, trackUid);
                    } else {
                        // Если свой трек не найден - добавляем в конец
                        newOrder.push(trackUid);
                    }
                } else {
                    // Если нет своего трека - добавляем в конец
                    newOrder.push(trackUid);
                }

                console.log('[OUT] Новый порядок:', newOrder);
                self._setCardOrder(newOrder);
                self._updateRankings();
                self._setPlayerPlayList(); // Обновляем плейлист
                $modal.remove();
                return;
            }

            const targetPlace = parseInt(place, 10);

            // Если кликнули на текущее место И трек отмечен - снимаем отметку
            if (track.voted && currentPlace === targetPlace) {
                track.voted = false;
                self._updateRankings(); // Обновит и цвет кнопки автоматически
                $modal.remove();
                return;
            }

            // Иначе - отмечаем трек и перемещаем на нужное место
            track.voted = true;

            // Перемещаем трек на targetPlace
            self._moveTrackToPositionNew(trackUid, targetPlace);

            // Обновляем рейтинги и плейлист (цвет кнопки обновится автоматически)
            self._updateRankings();
            self._setPlayerPlayList(); // Обновляем плейлист
            $modal.remove();
        });

        // Обработчик кнопки "Отправить" (только если все места выбраны)
        $modal.find('.confirm-button').on('click', function() {
            $modal.remove();
            self.showResultsModal();
        });

        $modal.find('.modal-close').on('click', () => $modal.remove());
        $modal.on('click', function(e) { if (e.target === this) $modal.remove(); });
    }

    _createVoteModalNew(trackUid) {
        const $modal = $('<div>').addClass('modal-overlay');
        const $modalContent = $('<div>').addClass('modal-content');
        const $heading = $('<h5>').addClass('modal-title').text('Выберите место для трека');
        const $placeButtons = $('<div>').addClass('place-buttons');

        // Получаем текущий порядок карточек
        const currentOrder = this._getCurrentCardOrder();
        const currentPlace = currentOrder.indexOf(trackUid) + 1; // 1-based
        const track = this.tracks.find(t => t.uid === trackUid);

        // Показываем ВСЕ места от 1 до MAX_VOTES
        for (let place = 1; place <= this.MAX_VOTES; place++) {
            const $button = $('<button>').addClass('place-button').attr('data-place', place).text(place);

            // Если это текущее место данного трека И трек отмечен - зелёный яркий
            if (track && track.voted && currentPlace === place) {
                $button.addClass('current');
            }
            // Если место занято другим voted треком - зелёный тёмный
            else {
                const trackAtPlace = this.tracks.find(t => {
                    const idx = currentOrder.indexOf(t.uid);
                    return idx + 1 === place && t.voted && t.uid !== trackUid;
                });
                if (trackAtPlace) {
                    $button.addClass('occupied');
                }
            }

            $placeButtons.append($button);
        }

        // Добавляем кнопку OUT
        const $outButton = $('<button>').addClass('place-button out-button').attr('data-place', 'out').text('OUT');
        $placeButtons.append($outButton);

        // Проверяем, все ли места выбраны
        const votesCount = Object.keys(this.votes).length;
        const places = Object.values(this.votes).sort((a, b) => a - b);
        const hasAllPlaces = places.length === this.MAX_VOTES &&
                            places.every((place, index) => place === index + 1);

        const $buttonContainer = $('<div>').addClass('modal-actions');

        // Если все места выбраны - показываем кнопку "Отправить"
        if (hasAllPlaces) {
            const $submitButton = $('<button>').addClass('confirm-button').text('Отправить');
            $buttonContainer.append($submitButton);
        }

        const $closeButton = $('<button>').addClass('modal-close cancel-button').text('Отменить');
        $buttonContainer.append($closeButton);

        $modalContent.append($heading).append($placeButtons).append($buttonContainer);
        $modal.append($modalContent);
        return $modal;
    }

    _moveTrackToPositionNew(trackUid, targetPlace) {
        const $container = $(this.containerSelector);
        const $allCards = $container.find('.track-card');

        // Получаем текущий порядок всех карточек
        const currentOrder = [];
        $allCards.each(function() {
            currentOrder.push($(this).data('uid'));
        });

        // Удаляем перемещаемый трек из текущей позиции
        const newOrder = currentOrder.filter(uid => uid !== trackUid);

        // Вставляем трек на новую позицию (targetPlace - 1, т.к. массив с 0)
        newOrder.splice(targetPlace - 1, 0, trackUid);

        // Применяем новый порядок
        this._setCardOrder(newOrder);

        // Сохраняем состояние
        this._saveVotingState();
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

            // НЕ удаляем кнопки - они переиспользуются в обоих режимах
            // Скрываем/показываем их через _applyModeSwitch

            // Determine if this place is a prize place
            const isPrize = currentPlace <= self.MAX_VOTES;

            // ВАЖНО: Если трек за пределами TOP - снимаем флаг voted
            if (track && !isPrize && track.voted) {
                track.voted = false;
                if (isDebug) {
                    console.log(`[_updateRankings] Трек ${track.title} вышел за пределы TOP-${self.MAX_VOTES}, voted снят`);
                }
            }

            // Set badge number and classes
            $badge.text(currentPlace).addClass('visible').show();
            $badge.removeClass('voted non-voted prize non-prize');

            if (track && track.voted && isPrize) {
                // Voted только в пределах TOP
                $badge.addClass('voted');
                $badge.addClass('prize');
                self.votes[trackUid] = currentPlace;
                if (isDebug) {
                    console.log(`[_updateRankings] Track ${currentPlace}: ${track.title} - voted prize`);
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

        // Панель подтверждения больше не используется
        // this._updateSubmitButtonState();

        // НОВЫЙ РЕЖИМ: Обновляем цвет кнопок в зависимости от voted
        if (!isOld) {
            this._updateVoteButtonsColor();
        }

        // Сохраняем состояние при каждом изменении рейтинга
        this._saveVotingState();
    }

    _renderSubmitControl() {
        $('#submit-votes-panel').remove();
        const $panel = $('<div>').attr('id', 'submit-votes-panel').addClass('submit-votes-panel hidden');
        const $info = $('<span>').addClass('vote-count-info').text(`Расставьте топ-${this.MAX_VOTES}`);
        const $btn = $('<button>').addClass('submit-btn').attr('disabled', true).text('Подтвердить');
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
            $panel.find('.vote-count-info').text(`${votesCount} / ${this.MAX_VOTES}`);

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

    // Загрузка и восстановление состояния голосования (новый режим)
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

    // Загрузка и восстановление состояния голосования (старый режим)
    _loadAndRestoreVotingStateOld() {
        const savedState = this._loadVotingState();

        if (!savedState) return;

        // Восстанавливаем прогресс прослушивания
        if (savedState.listenProgress) {
            this.tracks.forEach(track => {
                track.listenProgress = savedState.listenProgress[track.uid] || 0;
            });
        }

        // Восстанавливаем порядок карточек, если есть
        if (savedState.cardOrder && savedState.cardOrder.length > 0) {
            this._setCardOrder(savedState.cardOrder);
        }

        // Восстанавливаем голоса из votedFlags
        // Конвертируем voted flags в формат старого режима (votes = { trackUid: place })
        if (savedState.votedFlags) {
            const votedUids = Object.keys(savedState.votedFlags).filter(uid => savedState.votedFlags[uid]);

            // Если есть сохраненный порядок, используем его для определения мест
            if (savedState.cardOrder && savedState.cardOrder.length > 0) {
                let place = 1;
                savedState.cardOrder.forEach(uid => {
                    if (savedState.votedFlags[uid] && place <= this.MAX_VOTES) {
                        this.votes[uid] = place;
                        this.remainingPlaces = this.remainingPlaces.filter(p => p !== place);
                        place++;
                    }
                });
            }
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

        // ВАЖНО: Убеждаемся что свой трек в конце порядка
        const ownTrack = this.tracks.find(t => parseInt(t.userId, 10) === this.user.id);
        if (ownTrack) {
            // Удаляем свой трек из текущей позиции
            const ownTrackIndex = order.indexOf(ownTrack.uid);
            if (ownTrackIndex !== -1 && ownTrackIndex !== order.length - 1) {
                // Если свой трек не на последнем месте - перемещаем
                order.splice(ownTrackIndex, 1);
                order.push(ownTrack.uid);
                console.log('[_getCurrentCardOrder] Свой трек перемещен в конец порядка');
            }
        }

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

        // ВАЖНО: Убеждаемся что свой трек в конце
        const ownTrack = this.tracks.find(t => parseInt(t.userId, 10) === this.user.id);
        if (ownTrack) {
            // Удаляем свой трек из текущей позиции
            const ownCardIndex = orderedCards.findIndex(card => $(card).data('uid') === ownTrack.uid);
            if (ownCardIndex !== -1) {
                const ownCard = orderedCards.splice(ownCardIndex, 1)[0];
                // Помещаем в конец
                orderedCards.push(ownCard);
                console.log('[_setCardOrder] Свой трек перемещен в конец');
            }
        }

        // Применяем новый порядок в DOM
        $container.append(orderedCards);
    }

    // --- КОНВЕРТАЦИЯ МЕЖДУ РЕЖИМАМИ ГОЛОСОВАНИЯ ---

    // Конвертация из старого режима в новый
    _convertOldToNew() {
        // В старом режиме votes = { trackUid: place }
        // В новом режиме: порядок карточек + voted flags
        // Место = позиция в списке

        // ВАЖНО: Всегда обновляем флаги voted на основе текущего состояния votes
        this.tracks.forEach(track => {
            track.voted = this.votes[track.uid] ? true : false;
        });

        // Если есть голоса - расставляем voted треки на их места
        if (Object.keys(this.votes).length > 0) {
            // Получаем текущий порядок всех карточек
            const currentOrder = this._getCurrentCardOrder();

            // Создаем массив для нового порядка на основе текущего
            const newOrder = [...currentOrder];

            // Создаем map voted треков: { uid: place }
            const votedTracksMap = { ...this.votes };

            // Удаляем voted треки из их текущих позиций
            const votedUids = Object.keys(votedTracksMap);
            const nonVotedOrder = newOrder.filter(uid => !votedUids.includes(uid));

            // Создаем финальный массив
            const finalOrder = [];

            // Проходим по всем позициям от 1 до длины списка
            for (let position = 1; position <= currentOrder.length; position++) {
                // Ищем, есть ли voted трек для этой позиции
                const votedUidForPosition = votedUids.find(uid => votedTracksMap[uid] === position);

                if (votedUidForPosition) {
                    // Если есть voted трек для этой позиции - вставляем его
                    finalOrder.push(votedUidForPosition);
                } else {
                    // Иначе берем следующий non-voted трек
                    if (nonVotedOrder.length > 0) {
                        finalOrder.push(nonVotedOrder.shift());
                    }
                }
            }

            // Добавляем оставшиеся non-voted треки в конец (если они есть)
            finalOrder.push(...nonVotedOrder);

            // Устанавливаем новый порядок
            this._setCardOrder(finalOrder);

            if (isDebug) {
                console.log('[ConvertOldToNew] Converted votes:', this.votes);
                console.log('[ConvertOldToNew] Current order:', currentOrder);
                console.log('[ConvertOldToNew] New order:', finalOrder);
            }
        } else {
            // Нет голосов - порядок не меняем, только обновляем флаги voted (уже сделано выше)
            if (isDebug) {
                console.log('[ConvertOldToNew] No votes, keeping current order');
            }
        }

        // Сохраняем состояние
        this._saveVotingState();
    }

    // Конвертация из нового режима в старый
    _convertNewToOld() {
        // В новом режиме: порядок карточек + voted flags
        // Место = позиция в списке, voted = участвует в голосовании
        // В старом режиме: votes = { trackUid: place }

        // Очищаем старые голоса
        this.votes = {};
        this.remainingPlaces = Array.from({ length: this.MAX_VOTES }, (_, i) => i + 1);

        // Получаем порядок карточек
        const currentOrder = this._getCurrentCardOrder();

        // Назначаем места voted трекам на основе их ПОЗИЦИИ в списке (не порядкового номера среди voted)
        currentOrder.forEach((uid, index) => {
            const track = this.tracks.find(t => t.uid === uid);
            const place = index + 1; // Место = позиция в списке (1-based)

            // Пропускаем свои треки
            if (track && parseInt(track.userId || $(track.element).data('userid'), 10) === this.user.id) {
                return;
            }

            // Если трек voted и место в пределах MAX_VOTES
            if (track && track.voted && place <= this.MAX_VOTES) {
                this.votes[uid] = place;
                this.remainingPlaces = this.remainingPlaces.filter(p => p !== place);
            }
        });

        // Сохраняем состояние
        this._saveVotingState();

        if (isDebug) {
            console.log('[ConvertNewToOld] Converted votes:', this.votes);
            console.log('[ConvertNewToOld] Remaining places:', this.remainingPlaces);
        }
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
                        position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%);
                        background: #1a1a1a; padding: 8px 12px; border-radius: 8px;
                        z-index: 9999; display: flex; gap: 10px; align-items: center; border: 1px solid #333;
                    }
                    .submit-votes-panel.hidden { display: none; }
                    .submit-btn {
                        background: #ff0055; color: white; border: none;
                        padding: 6px 14px; border-radius: 6px; cursor: pointer;
                        transition: all 0.3s ease;
                        font-size: 14px;
                        font-weight: 500;
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
                    .vote-count-info {
                        color: white;
                        font-size: 14px;
                        font-weight: 500;
                    }
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

    // --- RESULT MODALS ---

    showResultsModal() {
        // Всегда показываем новое модальное окно
        this._showResultsModalNew();
    }

    // New System Modal (Desktop) - с drag-and-drop для финальной сортировки
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
                .attr('draggable', true) // Включаем drag-and-drop
                .attr('data-track-uid', trackUid)
                .attr('data-place', place);

            const $itemContent = $('<div>').addClass('sortable-item-content');
            const $placeCircle = $('<span>').addClass('place-circle').text(place);
            const $trackInfo = $('<span>').addClass('track-info-text')
                .html(`<span class="track-title text-black">${track.artist} — ${track.title}</span>`);

            $itemContent.append($placeCircle).append($trackInfo);

            // Добавляем drag handle (три вертикальные точки)
            const $dragHandle = $('<div>').addClass('drag-handle').html('⋮');
            $item.append($itemContent).append($dragHandle);
            $votesContainer.append($item);
        });

        const self = this;

        // Инициализируем Sortable для перетаскивания
        if (typeof Sortable !== 'undefined') {
            Sortable.create($votesContainer[0], {
                handle: '.drag-handle',
                animation: 150,
                onEnd: function () {
                    // Обновляем номера мест после перетаскивания
                    $votesContainer.find('.sortable-item').each(function(index) {
                        $(this).find('.place-circle').text(index + 1);
                        $(this).attr('data-place', index + 1);
                    });

                    // Обновляем порядок треков в общем списке
                    const newOrder = [];
                    $votesContainer.find('.sortable-item').each(function() {
                        newOrder.push($(this).data('track-uid'));
                    });

                    // Применяем новый порядок к основному списку
                    self._reorderVotedTracks(newOrder);
                }
            });
        }

        const $buttonContainer = $('<div>').addClass('modal-actions');
        const $confirmButton = $('<button>').addClass('confirm-button').text('Подтвердить и отправить');
        const $cancelButton = $('<button>').addClass('cancel-button').text('Вернуться');

        $buttonContainer.append($confirmButton).append($cancelButton);
        $modalContent.append($heading).append($votesContainer).append($buttonContainer);
        $modal.append($modalContent);
        $('body').append($modal);

        $confirmButton.on('click', function() {
            // Собираем финальный порядок после возможного перетаскивания
            const updatedVotes = self._collectSortedVotes($votesContainer);
            self.sendVote(updatedVotes);
            $modal.remove();
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

    // Переупорядочить voted треки в основном списке согласно новому порядку
    _reorderVotedTracks(newVotedOrder) {
        console.log('[_reorderVotedTracks] Новый порядок voted треков:', newVotedOrder);

        // Получаем текущий полный порядок
        const currentOrder = this._getCurrentCardOrder();

        // Создаем массив неотмеченных треков
        const unvotedTracks = currentOrder.filter(uid => !newVotedOrder.includes(uid));

        // Создаем финальный порядок: voted треки в новом порядке + неотмеченные треки
        const finalOrder = [...newVotedOrder, ...unvotedTracks];

        console.log('[_reorderVotedTracks] Финальный порядок:', finalOrder);

        // Применяем новый порядок
        this._setCardOrder(finalOrder);

        // Обновляем рейтинги и сохраняем
        this._updateRankings();
        this._setPlayerPlayList();
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

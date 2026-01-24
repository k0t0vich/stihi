// DEBUG & CONFIG
const isDebug = true;

function detectIsMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

const isOld = detectIsMobile(); // true = Old/Mobile system, false = New/Desktop system
// const isOld = true; // Force Old system
// const isOld = false; // Force New system

class VotingSystem {
    constructor(player, containerSelector, { user = null, eventUid = null, tourUid = null, voitedCount = 10 } = {}) {

        $('.voting-alert').remove();

        if (!user) {
            console.error("User ID is not defined");
            return;
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

        this.init();
    }

    init() {
        this._collectTracks();
        
        // Permission check serves as a gatekeeper
        const canVote = this._checkPermissions();
        if (!canVote) return;

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
        // Remove any existing vote buttons if we are resetting/reloading
        if (!isOld) $container.find('.vote-button').remove();

        // If DEBUG, we bypass standard checks but clean up UI
        if (isDebug) {
             return true;
        }

        // --- Real Permission Logic (from Old System) ---
        
        // 1. Check if user is a competing artist
        const isCompetingArtist = this.tracks.some(track => parseInt(track.userId, 10) === this.user.id);
        
        if (!isCompetingArtist) {
            const $alertElement = $('<div>')
                .addClass('voting-alert danger-alert')
                .text('Вы не являетесь конкурсным артистом тура и не можете голосовать.');
            
            $container.before($alertElement);
            
            // Hide buttons/interaction
            this._disableVotingUI();
            return false;
        }

        // 2. Check if already fully voted (>= MAX_VOTES)
        // Note: New system might handle re-sorting, but old system blocked it.
        // We will keep old blocking behavior for Mobile, but Desktop might allow editing until deadline?
        // For now, adhering to strict port of old logic implies blocking if done.
        if (Object.keys(this.votes).length >= this.MAX_VOTES) {
            const $alertElement = $('<div>')
                .addClass('voting-alert info-alert')
                .text('Вы уже проголосовали за все места.');
            
            $container.before($alertElement);
            this._disableVotingUI();
            
            // For mobile, we might want to show results button if they are done
            if (isOld) {
                // Logic handled in _initOld -> _renderVoteButtons typically
            }
            return false; 
        }

        return true;
    }

    _disableVotingUI() {
        const $container = $(this.containerSelector);
        $container.find('.vote-button').remove();
        if (!isOld) {
            // Disable drag and drop if initialized? 
            // Usually init happens after this check, so we just don't init.
        }
        $('#results-button').addClass('hidden');
    }

    sendVote(sortedVotes) {
        const self = this;
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
            },
            error: function(xhr, status, error) {
                self._showToast('Ошибка при отправке голосов', 'error');
                console.error("Ошибка при отправке голоса:", error);
            }
        });
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
        this._initialRandomSort();
        this._setupDragAndDrop();
        this._renderSubmitControl();
        this._initializeVotedFlags(); // Initialize voted flags
        this._updateRankings();
        this._setPlayerPlayList();
        this._bindBadgeClicks(); // Bind click handlers to badges
        this._setupPlayerListeners(); // Listen for play events
        this._initializeListenIndicators(); // Initialize listen progress indicators
    }

    _initialRandomSort() {
        if (this.sortedOnce) return;
        this.sortedOnce = true;

        const $container = $(this.containerSelector);
        const $cards = $container.find('.track-card').toArray();
        const self = this;

        let myTracks = [];
        let otherTracks = [];

        $cards.forEach(card => {
            const userId = parseInt($(card).data('userid'), 10);
            if (userId === self.user.id) {
                myTracks.push(card);
            } else {
                otherTracks.push(card);
            }
        });

        // Shuffle other tracks
        for (let i = otherTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }

        const sortedCards = [...otherTracks, ...myTracks];
        $container.append(sortedCards);
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
                $badge.removeClass('visible voted non-voted prize non-prize');
                return;
            }

            $card.find('.vote-button').remove(); // Ensure buttons are gone in Desktop mode

            // Determine if this place is a prize place
            const isPrize = currentPlace <= self.MAX_VOTES;

            // Set badge number and classes
            $badge.text(currentPlace).addClass('visible');
            $badge.removeClass('voted non-voted prize non-prize');

            if (track && track.voted) {
                $badge.addClass('voted');
                if (isPrize) {
                    $badge.addClass('prize');
                    self.votes[trackUid] = currentPlace;
                } else {
                    $badge.addClass('non-prize');
                }
            } else {
                $badge.addClass('non-voted');
                if (isPrize) {
                    $badge.addClass('prize');
                } else {
                    $badge.addClass('non-prize');
                }
            }

            currentPlace++;
        });

        this._updateSubmitButtonState();
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
        const totalVoted = this.tracks.filter(t => t.voted && parseInt(t.userId, 10) !== this.user.id).length;
        const $panel = $('#submit-votes-panel');
        const $btn = $panel.find('.submit-btn');

        if (totalVoted > 0) {
            $panel.removeClass('hidden');
            $panel.find('.vote-count-info').text(`Проголосовано: ${totalVoted} из ${this.MAX_VOTES}`);

            // Кнопка активна только если проголосовано ровно MAX_VOTES
            if (totalVoted === this.MAX_VOTES) {
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
        try {
            const saved = localStorage.getItem('votingSystem_listenProgress');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('[VotingSystem] Error loading listen progress:', e);
            return {};
        }
    }

    _saveListenProgress() {
        try {
            const progress = {};
            this.tracks.forEach(track => {
                if (track.listenProgress > 0) {
                    progress[track.uid] = track.listenProgress;
                }
            });
            localStorage.setItem('votingSystem_listenProgress', JSON.stringify(progress));
        } catch (e) {
            console.error('[VotingSystem] Error saving listen progress:', e);
        }
    }

    _bindBadgeClicks() {
        const self = this;
        $('body').off('click', `${this.containerSelector} .rank-badge.non-voted`);
        $('body').on('click', `${this.containerSelector} .rank-badge.non-voted`, function(e) {
            e.preventDefault();
            e.stopPropagation();

            const $badge = $(this);
            const $card = $badge.closest('.track-card');
            const trackUid = $card.data('uid');
            const track = self.tracks.find(t => t.uid === trackUid);

            if (track) {
                track.voted = true;
                self._updateRankings();
            }
        });
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
                        pointer-events: none;
                        border-color: white;
                    }

                    /* Voted + Non-Prize = Серый яркий */
                    .rank-badge.voted.non-prize {
                        background: #666666;
                        opacity: 1;
                        pointer-events: none;
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
                        position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
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

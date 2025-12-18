
// DEBUG
const isDebug = true;
const isMobile = false;

class VotingSystem {
	constructor(player, containerSelector, { user = null, eventUid = null, tourUid = null, voitedCount = 10 } = {}) {

		$('.voting-alert').remove();

		if (!user) {
			console.warn("User ID is not defined (Test Mode)");
			this.user = { id: 99999, uid: 'test-user-uid' };
		} else {
			this.user = user;
		}
		
		this.player = player;
		this.containerSelector = containerSelector;
		this.votes = {}; 
		this.MAX_VOTES = voitedCount;
		this.tracks = []; 
		this.eventUid = eventUid;
		this.tourUid = tourUid;
		this.init();
	}

	init() {
		this._collectTracks();
		this._checkPermissions();
		
        // 1. Сортируем 
		this._initialRandomSort(); 
		
        // 2. Инициализируем перетаскивание
		this._setupDragAndDrop();
		
        // 3. Рисуем кнопку
		this._renderSubmitControl();
        
        // 4. Обновляем цифры и данные плеера
        this._updateRankings();
        this._setPlayerPlayList(); 
	}

	_collectTracks() {
		const $container = $(this.containerSelector);
		const $trackElements = $container.find('.track-card');
		
		this.tracks = $trackElements.map(function() {
			const $el = $(this);
			return {
				element: this,
				uid: $el.data('uid'),
				title: $el.data('title'),
				artist: $el.data('artist'),
				userId: $el.data('userid'), 
				isVoted: false, 
				place: null
			};
		}).get();
	}

	_checkPermissions() {
		const $container = $(this.containerSelector);
		$('.voting-alert').remove();
        $container.find('.vote-button').remove();
		return true;
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

        // Shuffle
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
			onEnd: function(evt) {
				self._updateRankings(); 
                self._setPlayerPlayList(); 
			}
		});
	}

    _setPlayerPlayList() {
        // Debounce на всякий случай
        if (this._updateTimeout) clearTimeout(this._updateTimeout);
        
        this._updateTimeout = setTimeout(() => {
            const container = this.containerSelector;
            const $cards = $(container).find('.track-card');
            const newList = [];


            $cards.each(function(index) {
                const $el = $(this);
                // Собираем объект трека полностью
                const trackData = {
                    uid: $el.data('uid'),
                    id: $el.data('uid'),
                    title: $el.data('title'),
                    artist: $el.data('artist'),
                    file: $el.data('audio') || $el.data('url'), 
                    cover: $el.data('cover'),
                    duration: $el.data('duration'),
                    genre: $el.data('genre'),
                    // Дополнительные поля если нужны
                };
                
                // Формат хранения в плеере: { data: ..., $el: ... }
                newList.push({
                    data: trackData,
                    $el: $el
                });
            });

            if (this.player) {
                this.player.playlists[container].list = newList;
				console.log("VotingSystem._setPlayerPlayList: Обновляем список треков плеера");
				this.player._resyncPlaylistIndexes(container);
                // Если сейчас играет трек из этого плейлиста - обновляем currentIndex
                if (this.player.currentPlaylist === container && this.player.currentTrack) {
                    const newIndex = newList.findIndex(item => item.data.uid === this.player.currentTrack.uid);
                    this.player.playlists[container].currentIndex = newIndex !== -1 ? newIndex : -1;
                }
            }
        }, 50);
    }

    _injectMinimalStyles() {
        if (!$('#ranking-styles').length) {
			$('head').append(`
				<style id="ranking-styles">
					.rank-badge {
						position: absolute; top: -10px; left: -10px; width: 40px; height: 40px;
						background: #ff0055; color: white; border-radius: 50%;
						display: flex; align-items: center; justify-content: center;
						font-weight: bold; font-size: 18px; z-index: 10;
						box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white;
						pointer-events: none;
                        display: none; 
					}
					.rank-badge.visible { display: flex; }
					.track-card.my-track { opacity: 0.6; border: 1px dashed #666; }
                    
                    .submit-votes-panel {
						position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
						background: #1a1a1a; padding: 15px 30px; border-radius: 50px;
						z-index: 9999; display: flex; gap: 15px; align-items: center; border: 1px solid #333;
					}
                    .submit-votes-panel.hidden { display: none; }
                    .submit-btn { background: #ff0055; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; }
                    .vote-count-info { color: white; }
                    
                    /*.modal-results .sortable-item { display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333; background: #222; margin-bottom: 5px; }*/
                    /*.modal-results .place-circle { width: 30px; height: 30px; background: #ff0055; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-weight: bold; }*/
                    /*.modal-results .track-info-text { flex-grow: 1; color: white; }*/
				</style>
			`);
		}
    }

	_updateRankings() {
		const $cards = $(this.containerSelector).find('.track-card');
		let currentPlace = 1;
		this.votes = {};
		const self = this;

		$cards.each(function() {
			const $card = $(this);
			const trackUid = $card.data('uid');
			const trackUserId = parseInt($card.data('userid'), 10);
            
			let $badge = $card.find('.rank-badge');
			if ($badge.length === 0) {
				$badge = $('<div>').addClass('rank-badge');
				$card.append($badge);
			}

			if (trackUserId === self.user.id) {
				$card.addClass('my-track');
				$badge.removeClass('visible');
				return;
			}
            
            $card.find('.vote-button').remove();

			if (currentPlace <= self.MAX_VOTES) {
				self.votes[trackUid] = currentPlace;
				$badge.text(currentPlace).addClass('visible');
				currentPlace++;
			} else {
				$badge.removeClass('visible');
			}
		});

		this._updateSubmitButtonState();
	}

	_renderSubmitControl() {
		$('#submit-votes-panel').remove();
		const $panel = $('<div>').attr('id', 'submit-votes-panel').addClass('submit-votes-panel hidden');
		const $info = $('<span>').addClass('vote-count-info').text('Расставьте топ-10');
		const $btn = $('<button>').addClass('submit-btn').text('Подтвердить голоса');
		$panel.append($info).append($btn);
		$('body').append($panel);
		
        $btn.on('click', () => this.showResultsModal());
	}

	_updateSubmitButtonState() {
		const votesCount = Object.keys(this.votes).length;
		const $panel = $('#submit-votes-panel');
		if (votesCount > 0) {
			$panel.removeClass('hidden');
			$panel.find('.vote-count-info').text(`Выбрано: ${votesCount} из ${this.MAX_VOTES}`);
		}
	}

	showResultsModal() {
		// Get sorted votes by place
		const sortedVotes = Object.entries(this.votes).sort((a, b) => a[1] - b[1]);

		const $modal = $('<div>').addClass('modal-overlay modal-results');
		const $modalContent = $('<div>').addClass('modal-content');

		const $heading = $('<h5>').addClass('modal-title').text('Результаты голосования');

		const $votesContainer = $('<div>').addClass('sortable-container');

		// Create sortable items
		sortedVotes.forEach(([trackUid, place]) => {
			// Find track by UID
			const track = this.tracks.find(t => t.uid === trackUid);
			if (!track) return;

			const $item = $('<div>')
				.addClass('sortable-item')
				.attr('draggable', true)
				.attr('data-track-uid', trackUid)
				.attr('data-place', place);

			const $itemContent = $('<div>').addClass('sortable-item-content');

			const $placeCircle = $('<span>')
				.addClass('place-circle')
				.text(place);

			const $trackInfo = $('<span>')
				.addClass('track-info-text')
				.html(`<div class="text-pink marquee-container">
				<span class="track-title text-black  marquee-text">${track.artist} — ${track.title}</span></div>
			`);

			const $titleContainer = $trackInfo;
			$titleContainer
				.data('marquee-initialized', false)
				.marquee();

			$itemContent.append($placeCircle).append($trackInfo);

			const $dragHandle = $('<div>')
				.addClass('drag-handle')
				.html('<i class="las la-arrows-alt-v"></i>');

			$item.append($itemContent).append($dragHandle);
			$votesContainer.append($item);
		});

		// Add jQuery UI sortable functionality
		/*$votesContainer.sortable({
			handle: '.drag-handle',
			update: function(event, ui) {
				// Update place numbers after sorting
				$(this).find('.sortable-item').each(function(index) {
				$(this).find('.place-circle').text(index + 1);
				$(this).data('place', index + 1);
				});
			}
		});*/

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


		// Add buttons
		const $buttonContainer = $('<div>').addClass('modal-actions');

		const $confirmButton = $('<button>')
			.addClass('confirm-button')
			.text('Подтвердить');

		const $cancelButton = $('<button>')
			.addClass('cancel-button')
			.text('Отменить');

		$buttonContainer.append($confirmButton).append($cancelButton);

		// Build modal
		$modalContent.append($heading).append($votesContainer).append($buttonContainer);
		$modal.append($modalContent);
		$('body').append($modal);

		// Handle button clicks
		const self = this;

		$confirmButton.on('click', function() {
			const updatedVotes = self._collectSortedVotes($votesContainer);
			self._updateVotesFromSortedList(updatedVotes);
			$modal.remove();
			self.showConfirmModal(updatedVotes);
		});

		$cancelButton.on('click', function() {
			$modal.remove();
		});

		// Close when clicking overlay
		$modal.on('click', function(e) {
			if (e.target === this) $modal.remove();
		});
	}

    showResultsModal_new() {
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
		
		$cancelButton.on('click', function() {
			$modal.remove();
		});
		
		$modal.on('click', function(e) {
			if (e.target === this) $modal.remove();
		});
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

		const alertMessage = "TEST MODE: Голоса отправлены!\n\nPayload:\n" + 
							 JSON.stringify(payload, null, 2);
		
		alert(alertMessage);
		console.log("TEST MODE Payload:", payload);
		this._showToast('TEST MODE: Голоса отправлены!', 'success');
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
    
    _createVoteModal() {}
    _createCancelModal() {}
}

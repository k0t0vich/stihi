//-- VotingSystem --
class VotingSystem {
	constructor(player, containerSelector, { user = null, eventUid = null, tourUid = null, voitedCount = 10 } = {}) {
		
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
		this._renderVoteButtons();
		this._bindVoteButtonClicks();
		this._checkAndRenderResultsButton();
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
			isVoted: $el.data('isvoted') === 1,
			place: $el.data('place') ? parseInt($el.data('place'), 10) : null
		};
		}).get();

		// Collect any existing votes
		this.tracks.forEach(track => {
		if (track.isVoted && track.place !== null) {
			this.votes[track.uid] = track.place;
			this.remainingPlaces = this.remainingPlaces.filter(p => p !== track.place);
		}
		});
	}

	_renderVoteButtons() {
		const $container = $(this.containerSelector);
		
		// Удаляем предыдущие предупреждения
		$('.voting-alert').remove();
		
		// Проверяем, является ли пользователь участвующим артистом
		const isCompetingArtist = this.tracks.some(track => parseInt(track.userId, 10) === this.user.id);
		
		if (!isCompetingArtist) {
			const $alertElement = $('<div>')
				.addClass('voting-alert danger-alert')
				.text('Вы не являетесь конкурсным артистом тура и не можете голосовать.');
			
			$container.before($alertElement);
			
			// Скрываем все кнопки голосования
			this.tracks.forEach(track => {
				$(track.element).find('.vote-button').remove();
			});
			
			// Скрываем кнопку результатов, если она есть
			$('#results-button').addClass('hidden');
			return; // Важно: выходим из функции
		}

		// Если пользователь уже проголосовал за все места
		if (Object.keys(this.votes).length >= this.MAX_VOTES) { // Изменено на >= 5
			const $alertElement = $('<div>')
				.addClass('voting-alert info-alert')
				.text('Вы уже проголосовали за все места.');
			
			$container.before($alertElement);
			
			// Скрываем все кнопки голосования
			this.tracks.forEach(track => {
				$(track.element).find('.vote-button').remove();
			});
			
			// Показываем кнопку результатов (если она нужна после голосования)
			// Если вы хотите, чтобы результаты были доступны только после отправки,
			// то лучше не показывать кнопку до отправки.
			// Сейчас она будет показана, если голосование завершено.
			//this.showResultsModal(); // Вызываем модальное окно результатов
			return; // Важно: выходим из функции
		}

		this.tracks.forEach(track => {
			// Пропускаем собственный трек пользователя
			if (parseInt(track.userId, 10) === this.user.id) {
				$(track.element).find('.rating-container').html('<span class="vote-status">Вы не можете голосовать за самого себя!</span>');
				// Убедимся, что кнопка голосования для своего трека также удалена, если она была.
				$(track.element).find('.vote-button').remove(); 
				return;
			}
			
			let $voteButton = $(track.element).find('.vote-button');
			
			// Если кнопки нет, создаем ее
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
			
			// Обновляем состояние кнопки
			if (this.votes[track.uid]) {
				$voteButton.text(`${this.votes[track.uid]} место`).addClass('voted');
			} else {
				$voteButton.text('Голосовать').removeClass('voted');
			}
		});
		
		// Обновляем кнопку результатов (если она должна быть видна, даже если не все голоса отданы)
		// Эта строка может быть удалена, если showResultsModal вызывается только после 5 голосов.
		// this._checkAndRenderResultsButton(); 
	}

	_bindVoteButtonClicks() {
		const self = this;
		
		// Unbind previous click handlers
		$('body').off('click', `${this.containerSelector} .vote-button`);
		
		// Bind new click handlers
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
		
		// Handle place selection
		$modal.find('[data-place]').on('click', function() {
		const place = parseInt($(this).data('place'), 10);

		if (!self.remainingPlaces.includes(place)) return;
			
			self.votes[trackUid] = place;
			self.remainingPlaces = self.remainingPlaces.filter(p => p !== place);
			
			self._updateTrackCard($card, trackUid);
			self._checkAndRenderResultsButton();
		
			$modal.remove();
		});
		
		// Handle modal close
		$modal.find('.modal-close').on('click', function() {
			$modal.remove();
		});
		
		// Close when clicking overlay
		$modal.on('click', function(e) {
			if (e.target === this) $modal.remove();
		});
	}

	openCancelModal($card, trackUid) {
		const self = this;
		const $modal = this._createCancelModal(trackUid);
		$('body').append($modal);
		
		// Handle confirm cancel
		$modal.find('.confirm-cancel').on('click', function() {
		const place = self.votes[trackUid];
		delete self.votes[trackUid];
		self.remainingPlaces.push(place);
		self.remainingPlaces.sort((a, b) => a - b);
		
		self._updateTrackCard($card, trackUid);
		self._checkAndRenderResultsButton();
		
		$modal.remove();
		});
		
		// Handle modal close
		$modal.find('.modal-close').on('click', function() {
		$modal.remove();
		});
		
		// Close when clicking overlay
		$modal.on('click', function(e) {
		if (e.target === this) $modal.remove();
		});
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
		//const $resultsButton = $('#results-button');
		
		if (Object.keys(this.votes).length === this.MAX_VOTES && $(this.containerSelector).find('[data-isvoted="1"]').length < this.MAX_VOTES) {
			this.showResultsModal();
			/*if ($resultsButton.length === 0) {
				const $container = $(this.containerSelector);
				const $newButton = $('<button>')
				.attr('id', 'results-button')
				.addClass('results-button')
				.text('Результаты голосования');
				
				$container.before($newButton);
				
				// Bind click event
				const self = this;
				$newButton.on('click', function() {
					self.showResultsModal();
				});
			} else {
				$resultsButton.removeClass('hidden');
			}
			} else {
			if ($resultsButton.length) {
				$resultsButton.addClass('hidden');
			}*/
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
		// Reset votes
		this.votes = {};
		
		// Update votes based on new order
		sortedVotes.forEach(([trackUid, place]) => {
		this.votes[trackUid] = place;
		});
		
		// Update UI if needed
		this._renderVoteButtons();
	}

	showConfirmModal(sortedVotes) {
		const self = this;
		
		const $modal = $('<div>').addClass('modal-overlay');
		const $modalContent = $('<div>').addClass('modal-content');
		
		const $heading = $('<h5>').addClass('modal-title').text('Подтвердите голос');
		
		const $message = $('<p>').addClass('modal-message').text('Вы действительно хотите отправить голоса?');
		
		const $buttonContainer = $('<div>').addClass('modal-actions');
		
		const $confirmButton = $('<button>')
		.addClass('confirm-button')
		.text('Да');
		
		const $cancelButton = $('<button>')
		.addClass('cancel-button')
		.text('Нет');
		
		$buttonContainer.append($confirmButton).append($cancelButton);
		
		// Build modal
		$modalContent.append($heading).append($message).append($buttonContainer);
		$modal.append($modalContent);
		$('body').append($modal);
		
		// Handle button clicks
		$confirmButton.on('click', function() {
		self.sendVote(sortedVotes);
		$modal.remove();
		});
		
		$cancelButton.on('click', function() {
		$modal.remove();
		});
		
		// Close when clicking overlay
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
				//console.log("Голос отправлен:", response);
			},
			error: function(xhr, status, error) {
				self._showToast('Ошибка при отправке голосов', 'error');
				console.error("Ошибка при отправке голоса:", error);
			}
		});
	}

	_showToast(message, type = 'info') {
		const $toast = $('<div>')
		.addClass(`toast ${type}-toast`)
		.text(message);
		
		$('body').append($toast);
		
		// Display the toast
		setTimeout(function() {
		$toast.addClass('show');
		}, 10);
		
		// Auto-hide after 3 seconds
		setTimeout(function() {
		$toast.removeClass('show');
		setTimeout(function() {
			$toast.remove();
		}, 300);
		}, 3000);
	}

	_createVoteModal(trackUid) {
		const $modal = $('<div>').addClass('modal-overlay');
		const $modalContent = $('<div>').addClass('modal-content');
		
		const $heading = $('<h5>').addClass('modal-title').text('На какое место хотели бы поставить трек?');
		
		const $placeButtons = $('<div>').addClass('place-buttons');
		
		this.remainingPlaces.forEach(place => {
		const $button = $('<button>')
			.addClass('place-button')
			.attr('data-place', place)
			.text(place);
		$placeButtons.append($button);
		});
		
		const $closeButton = $('<button>')
		.addClass('modal-close cancel-button')
		.text('Отменить');
		
		$modalContent.append($heading).append($placeButtons).append($closeButton);
		$modal.append($modalContent);
		
		return $modal;
	}

	_createCancelModal(trackUid) {
		const $modal = $('<div>').addClass('modal-overlay');
		const $modalContent = $('<div>').addClass('modal-content');
		
		const $heading = $('<h5>').addClass('modal-title').text('Отменить голосование?');
		
		const $message = $('<p>')
		.addClass('modal-message')
		.text(`Вы действительно хотите отменить голос на ${this.votes[trackUid]} место?`);
		
		const $buttonContainer = $('<div>').addClass('modal-actions');
		
		const $confirmButton = $('<button>')
		.addClass('confirm-cancel danger-button')
		.text('Да, отменить');
		
		const $closeButton = $('<button>')
		.addClass('modal-close cancel-button')
		.text('Нет');
		
		$buttonContainer.append($confirmButton).append($closeButton);
		
		$modalContent.append($heading).append($message).append($buttonContainer);
		$modal.append($modalContent);
		
		return $modal;
	}
}
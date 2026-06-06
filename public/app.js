/**
 * SOUTH PARK PROXY & DASHBOARD FRONTEND
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const seasonsList = document.getElementById('seasons-list');
  const seasonsLoading = document.querySelector('.seasons-loading');
  const proxyStatusText = document.getElementById('proxy-status-text');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const sidebar = document.querySelector('.sidebar');
  const testProxyBtn = document.getElementById('test-proxy-btn');
  const searchInput = document.getElementById('search-input');
  
  // Views
  const welcomeView = document.getElementById('welcome-view');
  const episodesView = document.getElementById('episodes-view');
  const playerView = document.getElementById('player-view');
  
  // View content
  const currentSeasonTitle = document.getElementById('current-season-title');
  const episodesCount = document.getElementById('episodes-count');
  const episodesLoading = document.querySelector('.episodes-loading');
  const episodesGrid = document.getElementById('episodes-grid');
  
  const playerEpisodeMeta = document.getElementById('player-episode-meta');
  const playerEpisodeTitle = document.getElementById('player-episode-title');
  const playerEpisodeDesc = document.getElementById('player-episode-desc');
  const videoPlayerIframe = document.getElementById('video-player-iframe');
  
  // Navigation buttons
  const backToHomeBtn = document.getElementById('back-to-home-btn');
  const backToEpisodesBtn = document.getElementById('back-to-episodes-btn');
  
  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  // --- State ---
  let seasons = [];
  let currentSeasonEpisodes = [];
  let activeSeasonNum = null;

  // --- Initialize ---
  init();

  function init() {
    loadSeasons();
    setupEventListeners();
    checkProxyConnection();
  }

  // --- API Calls ---

  // Load seasons list
  async function loadSeasons() {
    try {
      const response = await fetch('/api/seasons');
      if (!response.ok) throw new Error('Falha ao buscar lista de temporadas');
      
      seasons = await response.json();
      renderSeasons();
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar temporadas: ' + error.message, 'error');
      seasonsLoading.innerHTML = `
        <i class="fa-solid fa-circle-exclamation" style="color: var(--danger-color)"></i>
        <span>Erro ao carregar. Tente atualizar a página.</span>
      `;
    }
  }

  // Load episodes for a season
  async function loadEpisodes(seasonNumber) {
    activeSeasonNum = seasonNumber;
    
    // UI state
    switchView('episodes');
    episodesLoading.classList.remove('hidden');
    episodesGrid.classList.add('hidden');
    currentSeasonTitle.textContent = `Temporada ${seasonNumber}`;
    episodesCount.textContent = `0 Episódios`;
    searchInput.value = ''; // Clear search on season change

    try {
      const response = await fetch(`/api/seasons/${seasonNumber}`);
      if (!response.ok) throw new Error(`Falha ao buscar episódios da temporada ${seasonNumber}`);
      
      currentSeasonEpisodes = await response.json();
      renderEpisodes(currentSeasonEpisodes);
    } catch (error) {
      console.error(error);
      showToast('Erro ao carregar episódios: ' + error.message, 'error');
      episodesLoading.classList.add('hidden');
    }
  }

  // Test proxy connection
  async function checkProxyConnection(notify = false) {
    if (notify) {
      showToast('Testando conexão com o proxy...', 'info');
    }
    
    const statusDot = document.querySelector('.status-dot');
    statusDot.className = 'status-dot loading';
    proxyStatusText.textContent = 'Proxy: Verificando...';

    try {
      const response = await fetch('/api/proxy-test');
      if (!response.ok) throw new Error('Conexão recusada');
      
      const result = await response.json();
      if (result.connection === 'success') {
        statusDot.className = 'status-dot online';
        proxyStatusText.textContent = 'Proxy: Ativo (US)';
        if (notify) {
          showToast(`Proxy operacional! Latência: ${result.responseTimeMs}ms`, 'success');
        }
      } else {
        throw new Error('Falha na resposta do servidor remoto');
      }
    } catch (error) {
      statusDot.className = 'status-dot offline';
      proxyStatusText.textContent = 'Proxy: Desconectado';
      if (notify) {
        showToast('Proxy indisponível: ' + error.message, 'error');
      }
    }
  }

  // --- Rendering Functions ---

  function renderSeasons() {
    seasonsLoading.classList.add('hidden');
    seasonsList.classList.remove('hidden');
    seasonsList.innerHTML = '';

    seasons.forEach(season => {
      const li = document.createElement('li');
      li.className = 'season-item';
      li.dataset.season = season.seasonNumber;
      
      li.innerHTML = `
        <button>
          <span>Temporada ${season.seasonNumber}</span>
          <span class="episode-indicator"><i class="fa-solid fa-chevron-right"></i></span>
        </button>
      `;

      li.addEventListener('click', () => {
        // Toggle active class
        document.querySelectorAll('.season-item').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
        
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
        
        loadEpisodes(season.seasonNumber);
      });

      seasonsList.appendChild(li);
    });
  }

  function renderEpisodes(eps) {
    episodesLoading.classList.add('hidden');
    episodesGrid.classList.remove('hidden');
    episodesGrid.innerHTML = '';
    
    episodesCount.textContent = `${eps.length} Episódio${eps.length !== 1 ? 's' : ''}`;

    if (eps.length === 0) {
      episodesGrid.innerHTML = `
        <div class="no-results" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary)">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; margin-bottom: 12px; color: var(--text-muted)"></i>
          <p>Nenhum episódio encontrado.</p>
        </div>
      `;
      return;
    }

    eps.forEach(ep => {
      const card = document.createElement('article');
      card.className = 'episode-card';
      
      // Setup image fallback using a high quality South Park logo image if no thumbnail exists
      const thumbnailSrc = ep.imageUrl || 'https://images.paramount.tech/uri/mgid:arc:imageassetref:shared.southpark.us.en:bc418d66-7342-11ea-a59c-0a7527021758?quality=0.7';

      card.innerHTML = `
        <div class="episode-thumbnail-container">
          <img class="episode-thumbnail" src="${thumbnailSrc}" alt="${ep.name}" loading="lazy">
          <span class="episode-number-overlay">EP ${ep.episodeNumber}</span>
          <div class="episode-play-overlay">
            <i class="fa-solid fa-play"></i>
          </div>
        </div>
        <div class="episode-info">
          <div class="episode-title-row">
            <h3>${ep.name}</h3>
          </div>
          <p class="episode-synopsis">${ep.description || 'Sem sinopse disponível.'}</p>
          <div class="episode-footer">
            <span class="episode-date">${ep.title}</span>
            <button class="play-btn">
              <i class="fa-solid fa-play"></i>
            </button>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        playEpisode(ep);
      });

      episodesGrid.appendChild(card);
    });
  }

  // --- Watch Episode (Player View) ---
  function playEpisode(ep) {
    // Setup views
    switchView('player');
    
    playerEpisodeMeta.textContent = `Temporada ${activeSeasonNum} • Episódio ${ep.episodeNumber}`;
    playerEpisodeTitle.textContent = ep.name;
    playerEpisodeDesc.textContent = ep.description || 'Sem sinopse disponível.';
    
    // Set video iframe source to our proxied endpoint
    // The relative URL ep.url looks like '/episodes/940f8z/south-park-cartman-gets-an-anal-probe-season-1-ep-1'
    const proxiedUrl = `/proxy${ep.url}`;
    
    console.log(`[UI] Loading proxied player URL in iframe: ${proxiedUrl}`);
    videoPlayerIframe.src = proxiedUrl;
    
    showToast(`Carregando: ${ep.name}`, 'info');
  }

  // --- Helper Functions ---

  function switchView(viewName) {
    welcomeView.classList.add('hidden');
    episodesView.classList.add('hidden');
    playerView.classList.add('hidden');

    if (viewName === 'welcome') {
      welcomeView.classList.remove('hidden');
      document.querySelectorAll('.season-item').forEach(item => item.classList.remove('active'));
      activeSeasonNum = null;
    } else if (viewName === 'episodes') {
      episodesView.classList.remove('hidden');
      // Stop player if running
      videoPlayerIframe.src = '';
    } else if (viewName === 'player') {
      playerView.classList.remove('hidden');
    }
  }

  function setupEventListeners() {
    // Mobile sidebar toggle
    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Test proxy button
    testProxyBtn.addEventListener('click', () => {
      checkProxyConnection(true);
    });

    // Back navigation
    backToHomeBtn.addEventListener('click', () => switchView('welcome'));
    backToEpisodesBtn.addEventListener('click', () => {
      switchView('episodes');
    });

    // Search filtration
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      
      if (!activeSeasonNum) {
        showToast('Escolha uma temporada antes de pesquisar!', 'info');
        searchInput.value = '';
        return;
      }
      
      if (query === '') {
        renderEpisodes(currentSeasonEpisodes);
        return;
      }

      const filtered = currentSeasonEpisodes.filter(ep => {
        const titleMatch = ep.name.toLowerCase().includes(query);
        const descMatch = (ep.description || '').toLowerCase().includes(query);
        const epNumMatch = `ep ${ep.episodeNumber}`.includes(query) || `episódio ${ep.episodeNumber}`.includes(query);
        return titleMatch || descMatch || epNumMatch;
      });

      renderEpisodes(filtered);
    });
  }

  // Toast notifications
  let toastTimeout;
  function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);
    
    toastMessage.textContent = message;
    
    // Reset classes
    toast.className = 'toast';
    toast.classList.add(type);
    
    // Show toast
    toast.classList.remove('hidden');
    
    // Hide after 4 seconds
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }
});

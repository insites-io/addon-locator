(function () {
  'use strict';

  var listBtn = document.getElementById('locator-list-view-btn');
  var gridBtn = document.getElementById('locator-grid-view-btn');
  var locatorList = document.getElementById('locator-list');

  if (!listBtn || !gridBtn || !locatorList) { return; }

  function setView(view) {
    if (view === 'grid') {
      locatorList.classList.add('is-grid');
      gridBtn.classList.add('is-active');
      listBtn.classList.remove('is-active');
    } else {
      locatorList.classList.remove('is-grid');
      listBtn.classList.add('is-active');
      gridBtn.classList.remove('is-active');
    }
  }

  listBtn.addEventListener('click', function () {
    setView('list');
  });

  gridBtn.addEventListener('click', function () {
    setView('grid');
  });

  var mqGrid = window.matchMedia('(max-width: 1200px)');

  function applyGridBreakpoint(e) {
    setView(e.matches ? 'grid' : 'list');
  }

  mqGrid.addEventListener('change', applyGridBreakpoint);
  applyGridBreakpoint(mqGrid);

}());

(function () {
  'use strict';

  var PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">' +
    '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.837 12 22 12 22S24 20.837 24 12C24 5.373 18.627 0 12 0z" fill="#05051D"/>' +
    '<circle cx="12" cy="12" r="4" fill="white"/></svg>';

  var MAP_STYLES = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
  ];

  var map, infoWindow, pinIcon, pinIconActive, colorMain, colorErrorHover, userPinIcon;
  var clustererInstance = null;
  var searchCenter = null;
  var userMarker = null;

  function buildCardHTML(p) {
    return '<div class="locator-map-card">' +
      '<div class="locator-map-card__logo">' +
        (p.logo ? '<img src="' + p.logo + '" alt="' + p.name + '">' : '') +
      '</div>' +
      '<div class="locator-map-card__body">' +
        '<div class="locator-map-card__header">' +
          '<div class="locator-map-card__identity">' +
            '<p class="locator-map-card__name">' + p.name + '</p>' +
          '</div>' +
          (p.tag ? '<span class="locator-tag locator-tag--' + p.tag + '"><i class="icon-check"></i> ' + p.tagLabel + '</span>' : '') +
        '</div>' +
        '<p class="locator-map-card__desc">' + p.desc + '</p>' +
        '<p class="locator-map-card__meta"><i class="icon-map-pin"></i> ' + p.address + '</p>' +
        (p.phone ? '<p class="locator-map-card__meta"><i class="icon-phone-1"></i> ' + p.phone + '</p>' : '') +
        '<div class="locator-map-card__actions">' +
          '<a href="' + p.href + '" class="locator-map-card__view-btn">View</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function setupMarkers() {
    if (clustererInstance) {
      clustererInstance.clearMarkers();
    }

    if (userMarker) {
      userMarker.setMap(null);
      userMarker = null;
    }

    if (infoWindow) {
      infoWindow.close();
    }

    var cards = document.querySelectorAll('.locator-card[data-lat]');
    var bounds = new google.maps.LatLngBounds();
    var markers = [];

    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        if (card.style.display === 'none') { return; }
        var lat = parseFloat(card.getAttribute('data-lat'));
        var lng = parseFloat(card.getAttribute('data-lng'));
        if (isNaN(lat) || isNaN(lng)) { return; }

        var p = {
          name: card.getAttribute('data-name') || '',
          type: card.getAttribute('data-type') || '',
          desc: card.getAttribute('data-desc') || '',
          address: card.getAttribute('data-address') || '',
          phone: card.getAttribute('data-phone') || '',
          logo: card.getAttribute('data-logo') || '',
          tag: card.getAttribute('data-tag') || '',
          tagLabel: card.getAttribute('data-tag-label') || '',
          href: card.getAttribute('href') || '#'
        };

        var marker = new google.maps.Marker({
          position: { lat: lat, lng: lng },
          icon: pinIcon,
          title: p.name
        });

        bounds.extend({ lat: lat, lng: lng });
        markers.push(marker);

        card.addEventListener('mouseenter', function () {
          marker.setIcon(pinIconActive);
          marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
        });

        card.addEventListener('mouseleave', function () {
          marker.setIcon(pinIcon);
          marker.setZIndex(null);
        });

        marker.addListener('click', function () {
          infoWindow.setContent(buildCardHTML(p));
          infoWindow.open(map, marker);
        });
      }(cards[i]));
    }

    var CLUSTER_SVG = '<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54">' +
      '<circle cx="27" cy="27" r="23" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.1" stroke-dasharray="32.17 16" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="19" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.4" stroke-dasharray="27.79 12" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="15" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.6" stroke-dasharray="23.42 8" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="12" fill="' + colorMain + '"/>' +
      '</svg>';

    clustererInstance = new markerClusterer.MarkerClusterer({
      map: map,
      markers: markers,
      algorithm: new markerClusterer.SuperClusterAlgorithm({ maxZoom: 22 }),
      renderer: {
        render: function (cluster) {
          return new google.maps.Marker({
            position: cluster.position,
            icon: {
              url: 'data:image/svg+xml,' + encodeURIComponent(CLUSTER_SVG),
              scaledSize: new google.maps.Size(54, 54),
              anchor: new google.maps.Point(27, 27),
              labelOrigin: new google.maps.Point(27, 27)
            },
            label: {
              text: String(cluster.count),
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '700',
              fontFamily: 'DM Sans, sans-serif'
            },
            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + cluster.count
          });
        }
      }
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
    } else if (searchCenter) {
      map.setCenter(searchCenter);
      map.setZoom(13);
    }

    if (searchCenter) {
      userMarker = new google.maps.Marker({
        position: searchCenter,
        map: map,
        icon: userPinIcon,
        title: 'Your search location',
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + 9999
      });
    }
  }

  window.initLocatorMap = function () {
    var mapEl = document.getElementById('locator-map');
    if (!mapEl || !window.google) { return; }

    colorMain = getComputedStyle(document.documentElement).getPropertyValue('--color-main').trim() || '#3044FF';
    colorErrorHover = getComputedStyle(document.documentElement).getPropertyValue('--error-hover').trim() || '#E3361E';

    var USER_PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">' +
      '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.837 12 22 12 22S24 20.837 24 12C24 5.373 18.627 0 12 0z" fill="' + colorErrorHover + '"/>' +
      '<circle cx="12" cy="12" r="4" fill="white"/></svg>';

    userPinIcon = {
      url: 'data:image/svg+xml,' + encodeURIComponent(USER_PIN_SVG),
      scaledSize: new google.maps.Size(28, 40),
      anchor: new google.maps.Point(14, 40)
    };

    pinIcon = {
      url: 'data:image/svg+xml,' + encodeURIComponent(PIN_SVG),
      scaledSize: new google.maps.Size(24, 34),
      anchor: new google.maps.Point(12, 34)
    };
    pinIconActive = {
      url: 'data:image/svg+xml,' + encodeURIComponent(PIN_SVG),
      scaledSize: new google.maps.Size(36, 51),
      anchor: new google.maps.Point(18, 51)
    };

    map = new google.maps.Map(mapEl, {
      center: { lat: -33.855, lng: 151.150 },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: MAP_STYLES
    });
    window.locatorMapInstance = map;

    infoWindow = new google.maps.InfoWindow({ maxWidth: 424 });

    setupMarkers();
  };

  window.updateLocatorMap = function (center) {
    if (!map) { return; }
    if (center) { searchCenter = center; }
    setupMarkers();
  };

}());

(function () {
  'use strict';

  var locationEl   = document.getElementById('locator-location');
  var distanceEl     = document.getElementById('locator-distance');
  var searchBtn    = document.getElementById('locator-search-btn');
  var locatorList  = document.getElementById('locator-list');
  var locatorPanel = document.getElementById('locator-list-panel');
  var statusEl     = document.getElementById('locator-status');

  if (!locationEl || !searchBtn || !locatorList) { return; }

  var currentLocation = '';
  var currentDistance = '15';
  var lastParams = null;
  var searchLatLng = null;
  var selectedCategories = {};
  var lastStatusArgs = [0, '', ''];
  var searchTotal = 0;

  function clearAllFilters() {
    currentLocation = '';
    searchLatLng = null;
    locationEl.setAttribute('value', '');
    syncDistanceState();
    fetchResults({ location: '', lat: '', lng: '', distance: '' }, true);
  }

  function attachClearBtn() {
    var btn = document.getElementById('locator-clear-filters');
    if (btn) { btn.addEventListener('click', clearAllFilters); }
  }

  function updateFilterGroupLabel() {
    var labelEl = document.querySelector('#locator-filter-categories .locator-filter-group__label');
    if (!labelEl) { return; }
    var count = Object.keys(selectedCategories).length;
    labelEl.textContent = count > 0 ? 'Partner tier (' + count + ')' : 'Partner tier';
  }

  function filterByCategories() {
    var cards = document.querySelectorAll('#locator-list .locator-card');
    var hasFilter = false;
    for (var key in selectedCategories) {
      if (selectedCategories.hasOwnProperty(key)) { hasFilter = true; break; }
    }
    var visibleCount = 0;
    for (var i = 0; i < cards.length; i++) {
      var tag = cards[i].getAttribute('data-tag') || '';
      var visible = !hasFilter || !!selectedCategories[tag];
      cards[i].style.display = visible ? '' : 'none';
      if (visible) { visibleCount++; }
    }
    if (window.updateLocatorMap) { window.updateLocatorMap(null); }
    if (!statusEl) { return; }
    if (hasFilter && visibleCount === 0) {
      statusEl.innerHTML = 'No partners match your filters. <button id="locator-clear-filters" type="button">Clear filters</button>';
      attachClearBtn();
    } else if (hasFilter) {
      var displayLocation = lastStatusArgs[1];
      var distance = lastStatusArgs[2];
      var label = visibleCount === 1 ? ' partner' : ' partners';
      if (displayLocation && distance) {
        statusEl.textContent = visibleCount + label + ' within ' + distance + 'km of ' + displayLocation + '.';
      } else {
        statusEl.textContent = visibleCount + label + ' found' + (displayLocation ? ' near ' + displayLocation : '') + '.';
      }
    } else {
      updateStatus(searchTotal, lastStatusArgs[1], lastStatusArgs[2]);
    }
    updateFilterGroupLabel();
  }

  function updateFilterCategories() {
    var groupEl = document.getElementById('locator-filter-categories');
    var listEl  = document.getElementById('locator-filter-category-list');
    if (!groupEl || !listEl) { return; }

    var cards = document.querySelectorAll('#locator-list .locator-card[data-tag]');
    var seen = {};
    var html = '';

    for (var i = 0; i < cards.length; i++) {
      var slug  = cards[i].getAttribute('data-tag');
      var label = cards[i].getAttribute('data-tag-label');
      if (slug && !seen[slug]) {
        seen[slug] = true;
        html += '<ins-checkbox name="locator_partner_tier" value="' + slug + '" label="' + label + '"></ins-checkbox>';
      }
    }

    listEl.innerHTML = html;
    groupEl.style.display = html ? '' : 'none';
  }

  function getUrlParam(name) {
    var match = window.location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
  }

  function getDistance() {
    return currentDistance || '15';
  }

  function setDistance(val) {
    currentDistance = val || '15';
    try { if (distanceEl && val) { distanceEl.setValue(val); } } catch (e) {}
  }

  function normalizeLocation(geocodeResult) {
    var components = geocodeResult.address_components;
    var locality = '';
    var state = '';
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (c.types.indexOf('locality') !== -1) { locality = c.long_name; }
      if (c.types.indexOf('administrative_area_level_1') !== -1) { state = c.short_name; }
    }
    return (locality && state) ? locality + ', ' + state : geocodeResult.formatted_address;
  }

  function updateStatus(total, displayLocation, distance) {
    lastStatusArgs = [total, displayLocation, distance];
    if (!statusEl) { return; }
    if (total === 0) {
      statusEl.innerHTML = 'No partners match your filters. <button id="locator-clear-filters" type="button">Clear filters</button>';
      attachClearBtn();
    } else if (displayLocation && distance) {
      var label = total === 1 ? ' partner' : ' partners';
      statusEl.textContent = total + label + ' within ' + distance + 'km of ' + displayLocation + '.';
    } else {
      statusEl.textContent = total + (total === 1 ? ' partner' : ' partners') + ' found' + (displayLocation ? ' near ' + displayLocation : '') + '.';
    }
  }

  function buildPaginationHTML(currentPage, totalPages) {
    if (!totalPages || totalPages <= 1) { return ''; }
    var html = '';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button class="locator-page-btn' + (i === currentPage ? ' is-active' : '') + '" type="button" data-page="' + i + '">' + i + '</button>';
    }
    return html;
  }

  if (locatorPanel) {
    locatorPanel.addEventListener('click', function (e) {
      var btn = e.target;
      while (btn && btn !== locatorPanel) {
        if (btn.classList && btn.classList.contains('locator-page-btn')) { break; }
        btn = btn.parentNode;
      }
      if (!btn || !btn.classList || !btn.classList.contains('locator-page-btn') || !lastParams) { return; }
      var page = parseInt(btn.getAttribute('data-page'), 10);
      var pageParams = {};
      for (var k in lastParams) { if (lastParams.hasOwnProperty(k)) { pageParams[k] = lastParams[k]; } }
      pageParams.page = page;
      fetchResults(pageParams, false);
    });
  }

  function syncDistanceState() {
    if (!distanceEl) { return; }
    if (currentLocation) {
      distanceEl.removeAttribute('disabled');
    } else {
      distanceEl.setAttribute('disabled', '');
    }
  }

  locationEl.addEventListener('insInput', function (e) {
    currentLocation = (e.detail && e.detail.value) || '';
    searchLatLng = null;
    syncDistanceState();
  });

  locationEl.addEventListener('insValueChange', function (e) {
    currentLocation = (e.detail && e.detail.value) || '';
    searchLatLng = null;
    syncDistanceState();
  });

  if (distanceEl) {
    distanceEl.addEventListener('insChange', function (e) {
      currentDistance = e.detail || '15';
    });

    var distanceTip = null;
    distanceEl.style.position = 'relative';

    distanceEl.addEventListener('mouseenter', function () {
      if (!distanceEl.hasAttribute('disabled')) { return; }
      distanceTip = document.createElement('div');
      distanceTip.className = 'locator-distance-tip';
      distanceTip.textContent = 'Enter a location first';
      distanceEl.appendChild(distanceTip);
    });

    distanceEl.addEventListener('mouseleave', function () {
      if (distanceTip) {
        distanceTip.parentNode && distanceTip.parentNode.removeChild(distanceTip);
        distanceTip = null;
      }
    });
  }

  locationEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      doSearch(true);
    }
  });

  searchBtn.addEventListener('insClick', function () {
    doSearch(true);
  });

  window.addEventListener('popstate', function (e) {
    var state = e.state || {};
    currentLocation = state.search || getUrlParam('search');
    locationEl.setAttribute('value', currentLocation);
    setDistance(state.distance || getUrlParam('distance'));
    if (state.lat && state.lng && state.distance) {
      fetchResults({ location: currentLocation, lat: state.lat, lng: state.lng, distance: state.distance }, false);
    } else {
      doSearch(false);
    }
  });

  function isPostcode(str) {
    return /^\d+$/.test((str || '').trim());
  }

  function buildDisplayLocation(inputStr, geocodeResult) {
    if (isPostcode(inputStr)) { return 'postcode ' + inputStr.trim(); }
    return geocodeResult ? normalizeLocation(geocodeResult) : inputStr;
  }

  function doSearch(pushState) {
    var distance = getDistance();

    if (!currentLocation) {
      fetchResults({ location: '', lat: '', lng: '', distance: '' }, pushState);
      return;
    }

    if (searchLatLng) {
      var displayLocation = buildDisplayLocation(currentLocation, null);
      fetchResults({ location: currentLocation, lat: searchLatLng.lat, lng: searchLatLng.lng, distance: distance, displayLocation: displayLocation }, pushState);
      return;
    }

    if (!distance || !window.google || !window.google.maps) {
      var displayLoc = buildDisplayLocation(currentLocation, null);
      fetchResults({ location: currentLocation, lat: '', lng: '', distance: distance, displayLocation: displayLoc }, pushState);
      return;
    }

    var country = window.locatorCountry;
    var geocodeAddress = (isPostcode(currentLocation) && country) ? currentLocation.trim() + ', ' + country : currentLocation;
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: geocodeAddress }, function (results, status) {
      if (status === 'OK' && results[0]) {
        var lat = results[0].geometry.location.lat();
        var lng = results[0].geometry.location.lng();
        var displayLocation = buildDisplayLocation(currentLocation, results[0]);
        fetchResults({ location: currentLocation, lat: lat, lng: lng, distance: distance, displayLocation: displayLocation }, pushState);
      } else {
        var displayLoc = buildDisplayLocation(currentLocation, null);
        fetchResults({ location: currentLocation, lat: '', lng: '', distance: distance, displayLocation: displayLoc }, pushState);
      }
    });
  }

  function fetchResults(params, pushState) {
    lastParams = params;

    var apiUrl = '/api/locator/find-a-partner?location=' + encodeURIComponent(params.location || '');
    if (params.distance) { apiUrl += '&distance=' + params.distance; }
    if (params.lat && params.lng) {
      apiUrl += '&lat=' + params.lat + '&lng=' + params.lng;
    }
    if (params.page && params.page > 1) {
      apiUrl += '&page=' + params.page;
    }

    if (pushState) {
      var qp = [];
      if (params.location) { qp.push('search=' + encodeURIComponent(params.location)); }
      if (params.distance)   { qp.push('distance=' + params.distance); }
      var pageUrl = window.location.pathname + (qp.length ? '?' + qp.join('&') : '');
      history.pushState({ search: params.location, distance: params.distance, lat: params.lat, lng: params.lng }, '', pageUrl);
    }

    locatorList.innerHTML = '<div class="locator-loading"><i class="icon-spinner"></i></div>';

    fetch(apiUrl)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.html && data.html.trim()) {
          locatorList.innerHTML = data.html;
        } else {
          locatorList.innerHTML = '<p class="locator-empty"></p>';
        }

        var paginationEl = document.getElementById('locator-pagination');
        if (paginationEl) {
          paginationEl.innerHTML = buildPaginationHTML(data.current_page || 1, data.total_pages || 1);
        }

        searchTotal = data.total || 0;
        updateStatus(searchTotal, params.displayLocation || params.location, params.distance);
        selectedCategories = {};
        updateFilterCategories();
        updateFilterGroupLabel();

        var center = (params.lat && params.lng) ? { lat: parseFloat(params.lat), lng: parseFloat(params.lng) } : null;
        if (window.updateLocatorMap) { window.updateLocatorMap(center); }
      })
      .catch(function () {
        locatorList.innerHTML = '<div class="locator-empty"><p>Something went wrong. Please try again.</p></div>';
      });
  }

  var filtersBtn   = document.getElementById('locator-filters-btn');
  var filtersDrawer = document.getElementById('locator-filters-drawer');

  if (filtersBtn && filtersDrawer) {
    filtersBtn.addEventListener('insClick', function () {
      filtersDrawer.setDrawerState(true);
    });
  }

  locatorList.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('locator-clear-btn')) {
      e.preventDefault();
      currentLocation = '';
      searchLatLng = null;
      locationEl.setAttribute('value', '');
      if (distanceEl) { try { distanceEl.setValue(''); } catch (ex) {} }
      selectedCategories = {};
      updateFilterGroupLabel();
      fetchResults({ location: '', lat: '', lng: '', distance: '' }, true);
    }
  });

  var filterCategoryList = document.getElementById('locator-filter-category-list');
  if (filterCategoryList) {
    filterCategoryList.addEventListener('insCheck', function (e) {
      var slug    = e.detail && e.detail.value;
      var checked = e.detail && e.detail.checked;
      if (!slug) { return; }
      if (checked) {
        selectedCategories[slug] = true;
      } else {
        delete selectedCategories[slug];
      }
      filterByCategories();
    });
  }

  if (window.matchMedia('(max-width: 639px)').matches) {
    document.body.classList.add('locator-mobile-map-open');
  }

  var seeMapBtn   = document.getElementById('locator-see-map-btn');
  var closeMapBtn = document.getElementById('locator-close-map-btn');

  if (seeMapBtn) {
    seeMapBtn.addEventListener('insClick', function () {
      document.body.classList.add('locator-mobile-map-open');
      setTimeout(function () {
        if (window.google && window.google.maps && window.locatorMapInstance) {
          google.maps.event.trigger(window.locatorMapInstance, 'resize');
          if (window.updateLocatorMap) { window.updateLocatorMap(null); }
        }
      }, 50);
    });
  }

  if (closeMapBtn) {
    closeMapBtn.addEventListener('insClick', function () {
      document.body.classList.remove('locator-mobile-map-open');
    });
  }

  var SSR_PAGE_SIZE = 10;
  var ssrPage = 1;
  var ssrCards = [];

  function renderSsrPagination() {
    var paginationEl = document.getElementById('locator-pagination');
    if (!paginationEl) { return; }
    var totalPages = Math.ceil(ssrCards.length / SSR_PAGE_SIZE);
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    var html = '';
    for (var p = 1; p <= totalPages; p++) {
      html += '<button class="locator-page-btn' + (p === ssrPage ? ' is-active' : '') + '" data-page="' + p + '" type="button">' + p + '</button>';
    }
    paginationEl.innerHTML = html;
    var btns = paginationEl.querySelectorAll('.locator-page-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        ssrShowPage(parseInt(this.getAttribute('data-page'), 10));
      });
    }
  }

  function ssrShowPage(page) {
    ssrPage = page;
    var start = (page - 1) * SSR_PAGE_SIZE;
    var end = start + SSR_PAGE_SIZE;
    for (var i = 0; i < ssrCards.length; i++) {
      if (i >= start && i < end) {
        ssrCards[i].classList.remove('is-page-hidden');
      } else {
        ssrCards[i].classList.add('is-page-hidden');
      }
    }
    renderSsrPagination();
    locatorList.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setupInitialPagination() {
    var all = locatorList.querySelectorAll('.locator-card');
    ssrCards = Array.prototype.slice.call(all);
    if (ssrCards.length <= SSR_PAGE_SIZE) { return; }
    ssrShowPage(1);
  }

  updateFilterCategories();

  var initialSearch = getUrlParam('search');
  var initialDistance = getUrlParam('distance');
  searchTotal = locatorList.querySelectorAll('.locator-card').length;
  syncDistanceState();
  if (initialSearch) {
    currentLocation = initialSearch;
    locationEl.setAttribute('value', initialSearch);
    syncDistanceState();
    setDistance(initialDistance);
    var initialDisplay = isPostcode(initialSearch) ? 'postcode ' + initialSearch.trim() : initialSearch;
    var initialDistanceDisplay = initialDistance || currentDistance;
    updateStatus(searchTotal, initialDisplay, initialDistanceDisplay);
    history.replaceState({ search: initialSearch, distance: initialDistanceDisplay }, '', window.location.href);
  } else {
    setupInitialPagination();
  }

  // Initialize Google Places Autocomplete on the location input, with a fallback in case the API is not loaded yet
  var autocompleteInitInterval = setInterval(function () {
    if (!window.google || !window.google.maps || !window.google.maps.places) { return; }
    var innerInput = locationEl.querySelector('input');
    if (!innerInput) { return; }
    clearInterval(autocompleteInitInterval);
    var autocomplete = new google.maps.places.Autocomplete(innerInput, { types: ['geocode'] });
    autocomplete.addListener('place_changed', function () {
      var place = autocomplete.getPlace();
      if (place && place.geometry && place.geometry.location) {
        searchLatLng = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        currentLocation = innerInput.value || place.name || place.formatted_address || currentLocation;
        locationEl.setAttribute('value', currentLocation);
        syncDistanceState();
      }
    });
  }, 300);

}());

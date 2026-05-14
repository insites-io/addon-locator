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
      gridBtn.setAttribute('aria-pressed', 'true');
      listBtn.setAttribute('aria-pressed', 'false');
    } else {
      locatorList.classList.remove('is-grid');
      listBtn.classList.add('is-active');
      gridBtn.classList.remove('is-active');
      listBtn.setAttribute('aria-pressed', 'true');
      gridBtn.setAttribute('aria-pressed', 'false');
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

  // Styling is controlled by the map style associated with LOCATOR_MAP_ID in Google Cloud Console.
  // Value comes from the `google_map_id` PlatformOS constant, injected via results.liquid.
  var LOCATOR_MAP_ID = window.locatorMapId || 'DEMO_MAP_ID';

  var PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">' +
    '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.837 12 22 12 22S24 20.837 24 12C24 5.373 18.627 0 12 0z" fill="#05051D"/>' +
    '<circle cx="12" cy="12" r="4" fill="white"/></svg>';

  var map, infoWindow, colorMain, colorErrorHover;
  var clustererInstance = null;
  var searchCenter = null;
  var searchDistance = null;
  var userMarker = null;

  function buildPinEl(svg) {
    var el = document.createElement('div');
    el.className = 'locator-pin';
    el.innerHTML = svg;
    el.style.transformOrigin = '50% 100%';
    el.style.transition = 'transform 0.15s ease-out';
    return el;
  }

  function buildUserPinEl() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 24 34">' +
      '<path d="M12 0C5.373 0 0 5.373 0 12c0 8.837 12 22 12 22S24 20.837 24 12C24 5.373 18.627 0 12 0z" fill="' + colorErrorHover + '"/>' +
      '<circle cx="12" cy="12" r="4" fill="white"/></svg>';
    return buildPinEl(svg);
  }

  function buildClusterEl(count) {
    var svg = '<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54">' +
      '<circle cx="27" cy="27" r="23" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.1" stroke-dasharray="32.17 16" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="19" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.4" stroke-dasharray="27.79 12" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="15" fill="none" stroke="' + colorMain + '" stroke-width="3" stroke-opacity="0.6" stroke-dasharray="23.42 8" stroke-linecap="butt"/>' +
      '<circle cx="27" cy="27" r="12" fill="' + colorMain + '"/>' +
      '</svg>';

    var wrapper = document.createElement('div');
    wrapper.className = 'locator-cluster';
    wrapper.style.position = 'relative';
    wrapper.style.width = '54px';
    wrapper.style.height = '54px';
    // AdvancedMarkerElement anchors at bottom-center; shift down so the SVG center aligns with the position.
    wrapper.style.transform = 'translateY(50%)';

    var bg = document.createElement('div');
    bg.style.position = 'absolute';
    bg.style.inset = '0';
    bg.innerHTML = svg;
    wrapper.appendChild(bg);

    var label = document.createElement('span');
    label.textContent = String(count);
    label.style.position = 'absolute';
    label.style.inset = '0';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.justifyContent = 'center';
    label.style.color = '#ffffff';
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.fontFamily = 'DM Sans, sans-serif';
    wrapper.appendChild(label);

    return wrapper;
  }

  function escapeAttr(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildCardHTML(p) {
    // Use placeholder image when no logo is set.
    var logoMarkup = p.logo
      ? '<img src="' + p.logo + '" alt="' + p.name + '">'
      : '<div class="placeholder-img vertical-align-middle"><div><i class="icon-panorame"></i></div></div>';

    return '<div class="locator-map-card">' +
      '<div class="locator-map-card__logo">' +
        logoMarkup +
      '</div>' +
      '<div class="locator-map-card__body">' +
        '<div class="locator-map-card__header">' +
          '<div class="locator-map-card__identity">' +
            '<p class="locator-map-card__name">' + p.name + '</p>' +
          '</div>' +
          (p.tag ? '<ins-tag class="locator-tag locator-tag--' + p.tag + '" label="' + p.tagLabel + '" icon="icon-check-2"></ins-tag>' : '') +
        '</div>' +
        '<p class="locator-map-card__desc">' + p.desc + '</p>' +
        '<p class="locator-map-card__meta"><i class="icon-map-pin" aria-hidden="true"></i> ' + p.address + '</p>' +
        (p.phone ? '<p class="locator-map-card__meta"><i class="icon-phone-1" aria-hidden="true"></i> ' + p.phone + '</p>' : '') +
        '<div class="locator-map-card__actions">' +
          '<a href="' + p.href + '" class="locator-map-card__view-btn" aria-label="View ' + escapeAttr(p.name) + '">View</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function setupMarkers() {
    if (clustererInstance) {
      clustererInstance.clearMarkers();
    }

    if (userMarker) {
      userMarker.map = null;
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

        var pinEl = buildPinEl(PIN_SVG);
        var marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat: lat, lng: lng },
          content: pinEl,
          title: p.name,
          gmpClickable: true
        });

        bounds.extend({ lat: lat, lng: lng });
        markers.push(marker);

        card.addEventListener('mouseenter', function () {
          pinEl.style.transform = 'scale(1.5)';
          marker.zIndex = 9999;
        });

        card.addEventListener('mouseleave', function () {
          pinEl.style.transform = '';
          marker.zIndex = null;
        });

        marker.addListener('gmp-click', function () {
          infoWindow.setContent(buildCardHTML(p));
          infoWindow.open({ map: map, anchor: marker });
          // Pan to the marker so the popup (anchored to it) sits centred on
          // the map viewport instead of wherever the marker happened to be.
          map.panTo(marker.position);
        });
      }(cards[i]));
    }

    clustererInstance = new markerClusterer.MarkerClusterer({
      map: map,
      markers: markers,
      algorithm: new markerClusterer.SuperClusterAlgorithm({ maxZoom: 22 }),
      renderer: {
        render: function (cluster) {
          return new google.maps.marker.AdvancedMarkerElement({
            position: cluster.position,
            content: buildClusterEl(cluster.count),
            zIndex: 9999 + cluster.count
          });
        }
      }
    });

    if (searchCenter && searchDistance) {
      // After a search: zoom the map to match the selected radius, regardless
      // of how the result pins are distributed. lng delta widens at higher
      // latitudes because 1° lng shrinks as cos(lat).
      var latDelta = searchDistance / 111;
      var lngDelta = searchDistance / (111 * Math.cos(searchCenter.lat * Math.PI / 180));
      var radiusBounds = new google.maps.LatLngBounds(
        { lat: searchCenter.lat - latDelta, lng: searchCenter.lng - lngDelta },
        { lat: searchCenter.lat + latDelta, lng: searchCenter.lng + lngDelta }
      );
      map.fitBounds(radiusBounds);
    } else if (!bounds.isEmpty()) {
      // No active search — fit to whatever pins are on the map (SSR seed set
      // on initial load, or the full directory after the X clears a search).
      map.fitBounds(bounds);
    } else if (searchCenter) {
      map.setCenter(searchCenter);
      map.setZoom(13);
    }

    if (searchCenter) {
      userMarker = new google.maps.marker.AdvancedMarkerElement({
        position: searchCenter,
        map: map,
        content: buildUserPinEl(),
        title: 'Your search location',
        zIndex: 99999
      });
    }
  }

  window.initLocatorMap = function () {
    var mapEl = document.getElementById('locator-map');
    if (!mapEl || !window.google) { return; }

    colorMain = getComputedStyle(document.documentElement).getPropertyValue('--color-main').trim() || '#3044FF';
    colorErrorHover = getComputedStyle(document.documentElement).getPropertyValue('--error-hover').trim() || '#E3361E';

    map = new google.maps.Map(mapEl, {
      center: { lat: -33.855, lng: 151.150 },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      mapId: LOCATOR_MAP_ID
    });
    window.locatorMapInstance = map;

    infoWindow = new google.maps.InfoWindow({ maxWidth: 424 });

    setupMarkers();
  };

  window.updateLocatorMap = function (center, distance) {
    // Called with no args → preserve current search context, just re-render
    // markers (used by client-side category filter and mobile see-map resize).
    // Called with args → set/clear the context. Stored even if the map isn't
    // ready yet, since on desktop the Maps script is lazy-loaded and
    // initLocatorMap may run after a search has already fired.
    if (arguments.length >= 1) { searchCenter = center || null; }
    if (arguments.length >= 2) { searchDistance = distance ? parseFloat(distance) : null; }
    if (!map) { return; }
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
  var selectedCategories = {};
  var lastStatusArgs = [0, '', ''];
  var searchTotal = 0;
  // Filter checkbox list is built lazily on first drawer open — keeps N
  // <ins-checkbox> custom-element upgrades off the initial paint path.
  var filtersInitialized = false;

  // Lat/lng are populated by AddressLookup (shared portal script) into hidden inputs when the user picks a suggestion.
  var latEl = document.getElementById('locator_latitude');
  var lngEl = document.getElementById('locator_longitude');

  function getSearchLatLng() {
    if (!latEl || !lngEl) { return null; }
    var lat = parseFloat(latEl.value);
    var lng = parseFloat(lngEl.value);
    if (isNaN(lat) || isNaN(lng)) { return null; }
    return { lat: lat, lng: lng };
  }

  function clearSearchLatLng() {
    if (latEl) { latEl.value = ''; }
    if (lngEl) { lngEl.value = ''; }
  }

  function clearAllFilters() {
    currentLocation = '';
    clearSearchLatLng();
    locationEl.setAttribute('value', '');
    syncDistanceState();
    fetchResults({ location: '', lat: '', lng: '', distance: '' }, true);
  }

  function attachClearBtn() {
    var btn = document.getElementById('locator-clear-filters');
    if (btn) { btn.addEventListener('click', clearAllFilters); }
  }

  function updateFilterGroupLabel() {
    var count = Object.keys(selectedCategories).length;
    var labelEl = document.querySelector('#locator-filter-categories .locator-filter-group__label');
    if (labelEl) {
      labelEl.textContent = count > 0 ? 'Partner tier (' + count + ')' : 'Partner tier';
    }
    var badgeEl = document.getElementById('locator-filters-btn-badge');
    if (badgeEl) {
      if (count > 0) {
        badgeEl.textContent = String(count);
        badgeEl.hidden = false;
      } else {
        badgeEl.hidden = true;
      }
    }
    // ins-button reactively re-renders when icon-right changes. We add the
    // attribute to reserve space the badge overlays, and strip it when there
    // are no active filters so a stray icon doesn't appear next to "Filters".
    var btn = document.getElementById('locator-filters-btn');
    if (btn) {
      if (count > 0) {
        btn.setAttribute('icon-right', 'icon-minus-circle');
      } else {
        btn.removeAttribute('icon-right');
      }
    }
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
    if (window.updateLocatorMap) { window.updateLocatorMap(); }
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
      html += '<button class="locator-page-btn' + (i === currentPage ? ' is-active' : '') + '" type="button" data-page="' + i + '" aria-label="Page ' + i + '"' + (i === currentPage ? ' aria-current="page"' : '') + '>' + i + '</button>';
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
    clearSearchLatLng();
    syncDistanceState();
  });

  locationEl.addEventListener('insValueChange', function (e) {
    currentLocation = (e.detail && e.detail.value) || '';
    clearSearchLatLng();
    syncDistanceState();
  });

  // X (clear) button for the location search input. 
  // Injects an .icon-close-1 element when there's a value, removes
  // it when empty. ins-input renders its child DOM asynchronously, so we use
  // a MutationObserver to wait for .input-wrap before wiring up.
  function initLocationClear() {
    var innerInput = locationEl.getElementsByTagName('input')[0];
    var inputWrap  = locationEl.querySelector('.input-wrap');
    var iconEl     = locationEl.querySelector('.icon-search-1') || locationEl.querySelector('.icon-search');

    if (!innerInput || !inputWrap || !iconEl) { return false; }

    var closeIcon = null;

    function showClose() {
      if (closeIcon) { return; }
      closeIcon = document.createElement('i');
      closeIcon.classList.add('icon-close-1', 'icon-wrap', 'icon-close-active', 'icon-close-style');
      inputWrap.insertBefore(closeIcon, iconEl);
    }

    function hideClose() {
      if (!closeIcon) { return; }
      closeIcon.remove();
      closeIcon = null;
    }

    // Show X on load if URL had ?search= (input is pre-filled).
    if (innerInput.value.trim()) { showClose(); }

    innerInput.addEventListener('input', function () {
      if (innerInput.value.trim()) { showClose(); } else { hideClose(); }
    });

    // AddressLookup writes to the inner input programmatically (no 'input' event fires).
    // Sync on blur so the X appears after picking a suggestion.
    innerInput.addEventListener('blur', function () {
      if (innerInput.value.trim()) { showClose(); } else { hideClose(); }
    });

    locationEl.addEventListener('click', function (e) {
      if (!e.target.classList.contains('icon-close-1')) { return; }
      innerInput.value = '';
      hideClose();
      clearAllFilters();
    });

    return true;
  }

  if (!initLocationClear()) {
    var clearObserver = new MutationObserver(function () {
      if (initLocationClear()) { clearObserver.disconnect(); }
    });
    clearObserver.observe(locationEl, { childList: true, subtree: true });
  }

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

    var latLng = getSearchLatLng();
    if (latLng) {
      var displayLocation = buildDisplayLocation(currentLocation, null);
      fetchResults({ location: currentLocation, lat: latLng.lat, lng: latLng.lng, distance: distance, displayLocation: displayLocation }, pushState);
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

    locatorList.innerHTML = '<div class="locator-loading" role="status" aria-live="polite"><i class="icon-spinner" aria-hidden="true"></i><span class="show-for-sr">Loading results…</span></div>';

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
        if (filtersInitialized) { updateFilterCategories(); }
        updateFilterGroupLabel();

        var center = (params.lat && params.lng) ? { lat: parseFloat(params.lat), lng: parseFloat(params.lng) } : null;
        if (window.updateLocatorMap) { window.updateLocatorMap(center, params.distance || ''); }
      })
      .catch(function () {
        locatorList.innerHTML = '<div class="locator-empty"><p>Something went wrong. Please try again.</p></div>';
      });
  }

  var filtersBtn = document.getElementById('locator-filters-btn');
  var filtersDrawer = null;

  // Drawer markup mirrors partials/website/find_a_partner/filters_drawer.liquid.
  // Kept inline so we can defer the <ins-drawer> custom-element upgrade until
  // the user actually opens the filters panel.
  function ensureFiltersDrawer() {
    if (filtersDrawer) { return filtersDrawer; }
    var html =
      '<ins-drawer id="locator-filters-drawer" label="Filters" position="right" custom-width="400px" backdrop-can-close>' +
        '<div class="locator-filter-body">' +
          '<div class="locator-filter-group" id="locator-filter-categories" role="group" aria-labelledby="locator-filter-categories-label" style="display:none">' +
            '<p class="locator-filter-group__label" id="locator-filter-categories-label">Partner tier</p>' +
            '<div id="locator-filter-category-list"></div>' +
          '</div>' +
        '</div>' +
        '<div class="locator-filter-footer">' +
          '<ins-button id="locator-filters-clear-btn" label="Clear all" icon="icon-trash" outlined color="primary"></ins-button>' +
          '<ins-button id="locator-filters-apply-btn" label="Apply Filters" icon="icon-check-2" solid color="primary"></ins-button>' +
        '</div>' +
      '</ins-drawer>';
    document.body.insertAdjacentHTML('beforeend', html);
    filtersDrawer = document.getElementById('locator-filters-drawer');
    var listEl = document.getElementById('locator-filter-category-list');
    if (listEl) {
      listEl.addEventListener('insCheck', function (e) {
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
    var clearBtn = document.getElementById('locator-filters-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('insClick', function () {
        var boxes = listEl ? listEl.querySelectorAll('ins-checkbox') : [];
        for (var i = 0; i < boxes.length; i++) {
          try { boxes[i].updateCheckState(false); } catch (ex) {}
        }
        selectedCategories = {};
        filterByCategories();
      });
    }
    var applyBtn = document.getElementById('locator-filters-apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('insClick', function () {
        filtersDrawer.setDrawerState(false);
      });
    }
    return filtersDrawer;
  }

  if (filtersBtn) {
    filtersBtn.addEventListener('insClick', function () {
      var drawer = ensureFiltersDrawer();
      if (!filtersInitialized) {
        updateFilterCategories();
        filtersInitialized = true;
      }
      // ins-drawer upgrades synchronously on insertAdjacentHTML, but defer the
      // setDrawerState call by a tick so Stencil has finished its initial
      // render before we ask it to open.
      setTimeout(function () { drawer.setDrawerState(true); }, 0);
    });
  }

  locatorList.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('locator-clear-btn')) {
      e.preventDefault();
      currentLocation = '';
      clearSearchLatLng();
      locationEl.setAttribute('value', '');
      if (distanceEl) { try { distanceEl.setValue(''); } catch (ex) {} }
      selectedCategories = {};
      updateFilterGroupLabel();
      fetchResults({ location: '', lat: '', lng: '', distance: '' }, true);
    }
  });

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
          if (window.updateLocatorMap) { window.updateLocatorMap(); }
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
      html += '<button class="locator-page-btn' + (p === ssrPage ? ' is-active' : '') + '" data-page="' + p + '" type="button" aria-label="Page ' + p + '"' + (p === ssrPage ? ' aria-current="page"' : '') + '>' + p + '</button>';
    }
    paginationEl.innerHTML = html;
    var btns = paginationEl.querySelectorAll('.locator-page-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        ssrShowPage(parseInt(this.getAttribute('data-page'), 10));
      });
    }
  }

  function ssrShowPage(page, skipScroll) {
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
    if (!skipScroll) {
      locatorList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setupInitialPagination() {
    var all = locatorList.querySelectorAll('.locator-card');
    ssrCards = Array.prototype.slice.call(all);
    if (ssrCards.length <= SSR_PAGE_SIZE) { return; }
    ssrShowPage(1, true);
  }

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
    // The SSR query is a text-contains match on city/postcode/address_1 and
    // returns a different set than the geocoded radius search the button-click
    // flow uses. Trigger doSearch() so the URL-loaded results match the
    // interactive search results. Needs Maps for the geocoder — kick the lazy
    // loader and poll until google.maps is ready.
    if (window.locatorLoadMaps) { window.locatorLoadMaps(); }
    var mapsReadyAttempts = 0;
    var mapsReadyInterval = setInterval(function () {
      mapsReadyAttempts++;
      if (window.google && window.google.maps) {
        clearInterval(mapsReadyInterval);
        doSearch(false);
      } else if (mapsReadyAttempts > 100) {
        // Maps failed to load after ~10s — fall back to a non-geocoded fetch
        // so the user still gets fresh results (even if they match the SSR set).
        clearInterval(mapsReadyInterval);
        doSearch(false);
      }
    }, 100);
  } else {
    setupInitialPagination();
  }

  // AddressLookup sets the inner input's value programmatically on selection (no event fires).
  // Sync currentLocation on blur so the picked formatted address is what doSearch() uses.
  var addressSyncInterval = setInterval(function () {
    var innerInput = locationEl.querySelector('input');
    if (!innerInput) { return; }
    clearInterval(addressSyncInterval);
    innerInput.addEventListener('blur', function () {
      var v = innerInput.value || '';
      if (v && v !== currentLocation) {
        currentLocation = v;
        locationEl.setAttribute('value', v);
        syncDistanceState();
      }
    });
  }, 300);

}());

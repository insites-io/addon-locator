(function () {

  var LocatorPortal = {

    init: function () {
      var visibilityToggle = document.getElementById('locator-visibility');
      var visibilityBanner = document.getElementById('locator-visibility-banner');
      var previewLink = document.getElementById('locator-preview-link');
      if (visibilityToggle) {
        visibilityToggle.addEventListener('insToggle', function (e) {
          var checked = e.detail && e.detail.checked;
          if (visibilityBanner) {
            if (checked) {
              visibilityBanner.classList.add('hide');
            } else {
              visibilityBanner.classList.remove('hide');
            }
          }
          if (previewLink) {
            if (checked) {
              previewLink.classList.remove('hide');
            } else {
              previewLink.classList.add('hide');
            }
          }
          LocatorPortal.updateVisibility(checked ? 'enabled' : 'disabled');
        });
      }

      var logoPicker = document.getElementById('locator-logo-picker');
      var bannerPicker = document.getElementById('locator-banner-picker');

      if (logoPicker) {
        logoPicker.addEventListener('insValueChange', function (e) {
          LocatorPortal.uploadImage(
            e.detail.base64,
            e.detail.filename,
            'location_image',
            'locator-logo-url',
            logoPicker
          );
        });
      }

      if (bannerPicker) {
        bannerPicker.addEventListener('insValueChange', function (e) {
          LocatorPortal.uploadImage(
            e.detail.base64,
            e.detail.filename,
            'image_1',
            'locator-banner-url',
            bannerPicker
          );
        });
      }

      // After the page hydrates:
      //   1. Restore the tab the user saved from (sessionStorage) — keeps
      //      them where they were instead of bouncing to Profile.
      //   2. Mirror per-field `.is-invalid` state up to the tab headers
      //      (server-rendered errors via `<ins-input has-error>` show up
      //      as `.is-invalid` on hydration).
      // Order matters: restore first, then errors. If errors exist
      // markInvalidTabs will switch to the first errored tab, which
      // overrides the restore — correct precedence (errors > convenience).
      var listingForm = document.getElementById('listing-form');
      if (listingForm) {
        setTimeout(function () {
          LocatorPortal.restoreActiveTab(listingForm);
          LocatorPortal.markInvalidTabs(listingForm);
        }, 300);
      }
    },

    uploadImage: function (base64, filename, property, hiddenInputId, pickerEl) {
      var hiddenInput = document.getElementById(hiddenInputId);
      axios.get('/api/locator/upload-presign', {
        params: {
          table: 'modules/insites_locator/location',
          property: property
        },
        headers: { 'Accept': 'application/json' }
      }).then(function (response) {
        var uploadData = response.data.s3_upload;
        var formData = new FormData();

        var fields = uploadData.form_data;
        Object.keys(fields).forEach(function (key) {
          formData.append(key, fields[key]);
        });

        var blob = LocatorPortal.base64ToBlob(base64);
        // Sanitize the filename before uploading. Spaces in S3 object keys end up
        // as literal spaces in the returned URL, which fails the backend's "valid
        // URL" check on save (PlatformOS rejects `https://…/green 2.jpeg`).
        // Replacing whitespace runs with a dash keeps the filename readable and
        // the resulting URL safe.
        var safeFilename = (filename || '').replace(/\s+/g, '-');
        formData.append('file', blob, safeFilename);

        return axios.post(uploadData.direct_upload_url, formData);
      }).then(function (response) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(response.data, 'text/xml');
        var locationEl = xml.getElementsByTagName('Location')[0];
        if (locationEl && hiddenInput) {
          // S3 returns the upload URL already percent-encoded (e.g. "green%202.jpeg").
          // Don't decode it — the backend stores this verbatim as the property upload
          // URL, and a decoded value with raw spaces fails the URL validation check
          // ("tried to store … which is not a valid URL").
          hiddenInput.value = locationEl.textContent;
        }
      }).catch(function (error) {
        if (pickerEl) pickerEl.value = '';
        App.events.notyf('error', 'Image upload failed. Please try again.');
      });
    },

    base64ToBlob: function (base64) {
      var parts = base64.split(',');
      var mime = parts[0].match(/:(.*?);/)[1];
      var byteString = atob(parts[1]);
      var buffer = new ArrayBuffer(byteString.length);
      var view = new Uint8Array(buffer);
      for (var i = 0; i < byteString.length; i++) {
        view[i] = byteString.charCodeAt(i);
      }
      return new Blob([buffer], { type: mime });
    },

    validateForm: async function (event) {
      if (event) event.preventDefault();

      var formElem = event ? event.target : null;
      if (!formElem) return false;

      var phoneEl = formElem.querySelector('#listing-phone');
      if (phoneEl) {
        var values = await phoneEl.getValues();
        document.getElementById('listing-phone-number').value = values.phone_number;
        document.getElementById('listing-phone-country-code').value = values.country_code;
      }

      var latEl = formElem.querySelector('#listing_latitude');
      var lngEl = formElem.querySelector('#listing_longitude');
      var geojsonEl = formElem.querySelector('#listing_geojson');
      if (latEl && lngEl && geojsonEl && latEl.value && lngEl.value) {
        geojsonEl.value = JSON.stringify({
          type: 'Point',
          coordinates: [parseFloat(lngEl.value), parseFloat(latEl.value)]
        });
      }

      LocatorPortal.normalizeUploadUrls(formElem);
      LocatorPortal.normalizeUrlFields(formElem);

      var isValid = await App.validation.validateForm(formElem);
      if (!isValid) {
        LocatorPortal.markInvalidTabs(formElem);
        return false;
      }

      // No client-side errors on submit: clear any lingering tab error
      // indicators (e.g. left over from a prior failed submit on the same
      // page view).
      LocatorPortal.markInvalidTabs(formElem);

      // Persist the tab the user is on so we can restore it after the form
      // redirects back to the page. Without this every save bounces them
      // back to Profile, even when they were editing Location or Social.
      LocatorPortal.rememberActiveTab(formElem);

      LocatorPortal.disableFormButtons(formElem, true);
      var saveBtn = formElem.querySelector('ins-button[type="submit"]');
      if (saveBtn) saveBtn.loading = true;
      formElem.submit();
      return true;
    },

    rememberActiveTab: function (formElem) {
      var items = formElem.querySelectorAll('ins-tab-item');
      var activeLabel = null;
      items.forEach(function (item) {
        if (item.active && item.label) activeLabel = item.label;
      });
      if (!activeLabel) return;
      try { sessionStorage.setItem('locatorActiveTab', activeLabel); } catch (e) {}
    },

    restoreActiveTab: function (formElem) {
      var saved = null;
      try { saved = sessionStorage.getItem('locatorActiveTab'); } catch (e) {}
      if (!saved) return;
      // One-shot: clear immediately so a later unrelated reload doesn't
      // pin the user to an old tab choice.
      try { sessionStorage.removeItem('locatorActiveTab'); } catch (e) {}

      var tabEl = formElem.querySelector('ins-tab');
      if (!tabEl || typeof tabEl.activateTab !== 'function') return;

      var items = formElem.querySelectorAll('ins-tab-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].label === saved) {
          tabEl.activateTab(i + 1); // 1-indexed per ins-tab API
          return;
        }
      }
    },

    disableFormButtons: function (formElem, state) {
      var buttons = formElem.querySelectorAll('ins-button');
      buttons.forEach(function (btn) { btn.disabled = state; });
    },

    normalizeUrlFields: function (formElem) {
      var urlInputs = formElem.querySelectorAll('[url-field]');
      urlInputs.forEach(function (input) {
        var value = (input.value || '').trim();
        if (value && !/^https?:\/\//i.test(value)) {
          input.value = 'https://' + value;
        }
      });
    },

    // Mirror per-field `.is-invalid` state up to the <ins-tab-item> headers so the
    // user can tell at a glance which tab has a validation failure. Setting
    // `item.hasError` triggers the component's insTabError event; the parent
    // <ins-tab> listens for that and toggles the `.has-error` class on the
    // matching header (see ins-tab.tsx:checkForErrors).
    //
    // If the user is currently looking at a tab with no errors but errors
    // live on another tab, switch to the first tab that has them — otherwise
    // the failure would be invisible behind the active tab pane.
    markInvalidTabs: function (formElem) {
      var tabItems = formElem.querySelectorAll('ins-tab-item');
      var firstInvalidIndex = -1;
      tabItems.forEach(function (item, idx) {
        var hasInvalid = !!item.querySelector('.is-invalid');
        item.hasError = hasInvalid;
        if (hasInvalid && firstInvalidIndex === -1) firstInvalidIndex = idx;
      });

      if (firstInvalidIndex < 0) return;

      var activeNow = formElem.querySelector('ins-tab-item[active]');
      var activeHasError = activeNow && activeNow.querySelector('.is-invalid');
      if (activeHasError) return;

      var tabEl = formElem.querySelector('ins-tab');
      if (tabEl && typeof tabEl.activateTab === 'function') {
        tabEl.activateTab(firstInvalidIndex + 1);
      }
    },

    // Older records may have logo/banner URLs that were saved with raw spaces
    // (e.g. `…/green 2.jpeg`). Re-saving the form would forward that invalid
    // URL to the backend and trip its URL validator. Percent-encode any spaces
    // here so the submission carries a valid URL even when no new upload
    // happens this session.
    normalizeUploadUrls: function (formElem) {
      var ids = ['locator-logo-url', 'locator-banner-url'];
      ids.forEach(function (id) {
        var input = formElem.querySelector('#' + id);
        if (input && input.value && / /.test(input.value)) {
          input.value = input.value.replace(/ /g, '%20');
        }
      });
    },

    updateVisibility: function (status) {
      axios.get('/api/locator/update-visibility', {
        params: { status: status },
        headers: { 'Accept': 'application/json' }
      }).then(function (response) {
        if (!response.data || !response.data.ok) {
          App.events.notyf('error', 'Failed to update visibility.');
          return;
        }
        if (status === 'enabled') {
          App.events.notyf('success', 'Your listing is now visible on the partner directory.');
        } else {
          App.events.notyf('success', 'Your listing is no longer visible on the partner directory.');
        }
      }).catch(function () {
        App.events.notyf('error', 'Failed to update visibility.');
      });
    }

  };

  window.LocatorPortal = LocatorPortal;

  document.addEventListener('DOMContentLoaded', function () {
    LocatorPortal.init();
  });

}());

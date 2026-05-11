(function () {

  var LocatorPortal = {

    init: function () {
      var visibilityToggle = document.getElementById('locator-visibility');
      var visibilityBanner = document.getElementById('locator-visibility-banner');
      if (visibilityToggle && visibilityBanner) {
        visibilityToggle.addEventListener('insToggle', function (e) {
          if (e.detail && e.detail.checked) {
            visibilityBanner.classList.add('hide');
          } else {
            visibilityBanner.classList.remove('hide');
          }
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
    },

    uploadImage: function (base64, filename, property, hiddenInputId, pickerEl) {
      var hiddenInput = document.getElementById(hiddenInputId);
      console.log('test: Requesting S3 upload presign for property:', property);
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
        formData.append('file', blob, filename);

        console.log('test: Uploading to S3 with form data:', formData);
        return axios.post(uploadData.direct_upload_url, formData);
      }).then(function (response) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(response.data, 'text/xml');
        var locationEl = xml.getElementsByTagName('Location')[0];
        if (locationEl && hiddenInput) {
          hiddenInput.value = decodeURIComponent(locationEl.textContent);
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

      LocatorPortal.normalizeUrlFields(formElem);

      var isValid = await App.validation.validateForm(formElem);
      if (!isValid) return false;

      LocatorPortal.disableFormButtons(formElem, true);
      var saveBtn = formElem.querySelector('ins-button[type="submit"]');
      if (saveBtn) saveBtn.loading = true;
      formElem.submit();
      return true;
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
    }

  };

  window.LocatorPortal = LocatorPortal;

  document.addEventListener('DOMContentLoaded', function () {
    LocatorPortal.init();
  });

}());

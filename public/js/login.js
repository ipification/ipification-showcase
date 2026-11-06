var isMobile;
var countryCode;
var disabledSelectCountry = typeof disabled_select_country !== 'undefined' && disabled_select_country;
var authServers = [];
var selectedServerId = null;
console.log('*** app_env: ', app_env);
console.log('*** default_country_code: ', default_country_code);

function updateWindowResize() {
  isMobile = window.innerWidth <= 768 || window.bowser.getParser(navigator.userAgent).getPlatformType() === 'mobile';
  console.log('isMobile', isMobile);
}

function fetchCountryCode(callback) {
  if(default_country_code && default_country_code !== '') {
    countryCode = default_country_code;
    callback();
    return;
  }

  if(app_env !== 'stage') {
    $.get('/api/geoip', function (data) {
      console.log('*** geoip data: ', data);
      if(data) {
        countryCode = data.country;
        console.log('*** countryCode: ', countryCode);
      }

      showViettelLegal(countryCode);
      callback();
    })
  } else {
    callback();
  }
}

window.addEventListener("resize", updateWindowResize);
updateWindowResize();

const preferredCountries = [''];

if (app_env === 'stage') {
  // add custom country
  const countryData = window.intlTelInput.getCountryData();

  countryData.push({
    name: 'Wonderland',
    iso2: 'ww',
    dialCode: '999',
    priority: 0,
    areaCodes: null,
    nodeById: {},
  });

  preferredCountries.push('ww');
}

function showViettelLegal(code) {
  if (code == 'vn') {
    $('.viettel-legal').css('display', 'block');
  } else {
    $('.viettel-legal').css('display', 'none');
  }
}

// Auth Server Management Functions
function getSelectedServerId() {
  return $('#select_auth_server').val() || selectedServerId;
}

function saveSelectedServerId(serverId) {
  localStorage.setItem('selected_auth_server_id', serverId);
  selectedServerId = serverId;
  updateServerInfoDisplay();
}

function loadSelectedServerId() {
  const saved = localStorage.getItem('selected_auth_server_id');
  if (saved && authServers.find(s => s.id === saved)) {
    return saved;
  }
  return authServers.length > 0 ? authServers[0].id : null;
}

function updateServerInfoDisplay() {
  const serverId = getSelectedServerId();
  const server = authServers.find(s => s.id === serverId);
  if (server) {
    $('#selected_server_info').text(`${server.id}: ${server.url}`);
  }
}

function initAuthServerDropdown() {
  $.get('/api/config', function(config) {
    authServers = config.auth_servers || [];
    console.log('*** Auth servers:', authServers);

    if (authServers.length > 0) {
      selectedServerId = loadSelectedServerId();
      $('#select_auth_server').val(selectedServerId);
      updateServerInfoDisplay();

      // Handle dropdown change
      $('#select_auth_server').on('change', function() {
        const serverId = $(this).val();
        console.log('*** Server changed to:', serverId);
        saveSelectedServerId(serverId);
      });
    }
  });
}

function showConsentPage() {
  Swal.fire({
    title: '',
    html: "<div class='consent-page'><iframe src='https://www.ipification.com/consents/vn-viettel-001-vi.html' title=''></iframe></div>",
    showConfirmButton: false,
    showCloseButton: true,
    // heightAuto: false
  });
}

function initPhoneInput(input) {
  showViettelLegal(countryCode);
  if (!preferredCountries.includes(countryCode)) preferredCountries.push(countryCode);

  window.intlTelInput(input, {
    allowDropdown: !disabledSelectCountry,
    countrySearch: !disabledSelectCountry,
    formatOnDisplay: true,
    showSelectedDialCode: true,
    initialCountry: app_env === 'stage' ? 'ww' : countryCode,
    // geoIpLookup: function (success, failure) {
    //   success(countryCode);
    // },
    customPlaceholder: function (selectedCountryPlaceholder, selectedCountryData) {
      return selectedCountryData.name === 'Wonderland' ? '123456789' : selectedCountryPlaceholder;
    },
    preferredCountries: preferredCountries,
    separateDialCode: true,
    // utilsScript: '/js/lib/intl-tel-input-20.0.5/js/utils.js',
  });

  input.addEventListener('countrychange', function () {
    var itic = window.intlTelInput.getInstance(input);
    const country = itic.getSelectedCountryData();
    showViettelLegal(country.iso2);
  });
}

function randomstring(L) {
  var s = '';
  var randomchar = function () {
    var n = Math.floor(Math.random() * 62);
    if (n < 10) return n; //1-10
    if (n < 36) return String.fromCharCode(n + 55); //A-Z
    return String.fromCharCode(n + 61); //a-z
  };
  while (s.length < L) s += randomchar();
  return s;
}

function goto_link(url) {
  $('.wrapper-loader').addClass('show');
  window.location.href = url;
}

function choose_option(selector) {
  $('.btn').removeClass('btn-active');
  $('.btn_' + selector).addClass('btn-active');
}

function attachWebOtpToInput(getInput, onCodeReceived) {
  if (!window.isSecureContext || !('OTPCredential' in window) || !('credentials' in navigator)) {
    return null;
  }

  const ac = new AbortController();

  navigator.credentials.get({
    otp: { transport: ['sms'] },
    signal: ac.signal
  }).then((otp) => {
    const input = getInput();
    if (!input || !otp || !otp.code) {
      return;
    }

    input.value = otp.code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onCodeReceived(otp.code);
  }).catch((error) => {
    if (error && error.name !== 'AbortError') {
      console.log('WebOTP error', error.message || error);
    }
  });

  return ac;
}

function sanitizeOtpValue(value) {
  return (value || '').replace(/\D/g, '');
}

$(document).ready(function () {
  if (window.DigitalCredential?.userAgentAllowsProtocol?.('openid4vp-v1-unsigned') === true) {
    $('#login_sim, #pvn_sim').removeClass('d-none');
  }

  // Initialize auth server dropdown
  initAuthServerDropdown();

  fetchCountryCode(function(){
    // country phone setting library
    document.querySelectorAll('.phoneNumber').forEach((el) => {
      initPhoneInput(el);
    });
  })

  if(isMobile) {
    $('#pvn_ipificator').css('display', 'block');
  }


  $('.info-icon').on('click', function () {
    $('#app_info').modal('show');
  });

  $('.btn-user-flow').click(function () {
    var user_flow = $(this).data('user-flow');
    var client_id = $(this).data('client-id');
    var phone_number;
    var dialCode;

    if (['pvn_ip', 'pvn_ip_plus', 'pvn_im', 'kyc_phone', 'pvn_ipificator', 'pvn_sim', 'pvn_sms'].indexOf(user_flow) >= 0) {
      var parent = $(this).closest('.block-button');
      var inputPhone = parent.find('input.phoneNumber');

      if (inputPhone.length >= 0) {
        var iti = window.intlTelInput.getInstance(inputPhone[0]);
        phone_number = iti.getNumber();
        dialCode = iti.getSelectedCountryData().dialCode
        phone_number = (phone_number || '').replace(/[ +]/g, '');

        if (!phone_number || phone_number == '') {
          $('.wrapper-loader').removeClass('show');
          $('#input_alert').modal('show');
          return;
        }

        if (!iti.isValidNumber() && dialCode !== '999') {
          $('.wrapper-loader').removeClass('show');
          $('#phone_invalid_alert').modal('show');
          return;
        }
      }
    }

    if(user_flow === 'pvn_sim') {
      start_pvn_sim(client_id, phone_number);
      return;
    }

    if(user_flow === 'pvn_sms') {
      start_pvn_sms(client_id, phone_number);
      return;
    }

    if(user_flow === 'login_sim') {
      start_login_sim(client_id);
      return;
    }

    localStorage.setItem('selector', location.hash.substring(1));
    var data_title = $(this).attr('data-title');

    // Get selected server_id
    var serverId = getSelectedServerId();
    if (!serverId) {
      alert('Please select an auth server');
      return;
    }

    var params = new URLSearchParams({
      user_flow: user_flow,
      server_id: serverId,
    });

    if (phone_number) params.set('phone', phone_number);

    var redirectURL = base_url + '/auth/start';

    if (isMobile || user_flow === 'pvn_im' || user_flow === 'login_im') {
      params.set('state', randomstring(10));
      redirectURL += '?' + params.toString();
      // console.log('redirectURL', redirectURL);
      goto_link(redirectURL);
    } else {
      // state format "randomstring-qrcode" and we will know use qr code or not
      var state = randomstring(10) + '-' + 'qrcode';
      params.set('state', state);
      redirectURL += '?' + params.toString();
      console.log('QR URL', redirectURL);
      showQrcodeWithLink(data_title, redirectURL, state);
    }
  });

  async function start_pvn_sim(client_id, phone_number) {
    console.log('start_pvn_sim');

    const serverId = getSelectedServerId();
    if (!serverId) {
      alert('Please select an auth server');
      return;
    }

    const data = {
      "login_hint": phone_number,
      "carrier_hint": 51010,
      "client_id": client_id,
      "scope": "openid ip:phone_verify",
      "server_id": serverId
    }

    start_ts43_flow(data);
  }

  async function start_pvn_sms(client_id, phone_number) {
    console.log('start_pvn_sms');

    const serverId = getSelectedServerId();
    if (!serverId) {
      alert('Please select an auth server');
      return;
    }

    const data = {
      "login_hint": phone_number,
      "client_id": client_id,
      "scope": "openid ip:phone_verify",
      "server_id": serverId
    }

    start_sms_flow(data);
  }

  async function start_login_sim(client_id) {
    console.log('start_login_sim');

    const serverId = getSelectedServerId();
    if (!serverId) {
      alert('Please select an auth server');
      return;
    }

    const data = {
      "login_hint": "anonymous",
      "carrier_hint": 51010,
      "client_id": client_id,
      "operation": "GetPhoneNumber",
      "scope": "openid ip:phone",
      "server_id": serverId
    }

    start_ts43_flow(data);
  }

  async function start_ts43_flow(data) {
    try {
      const response = await fetch('/ts43/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if(!response.ok) {
        alert('AuthError: ' + response.statusText);
        return;
      }

      const body = await response.json();
      const { auth_req_id, digital_request, nonce } = body;

      try {
        var credentialResponse  = await navigator.credentials.get({
          digital: {
            requests: [digital_request]
          },
        })

        // var credentialResponse = {
        //   data: {
        //     vp_token: {
        //     'ipification.com': [
        //       '1234567890'
        //     ]
        //   }
        //   }
        // }

        if(credentialResponse == null) {
            alert('Response is null')
        } else {
          const credentialData = credentialResponse.token || credentialResponse.data

          const { vp_token } = credentialData || {}
          const dataToken = {
            "vp_token": vp_token['ipification.com'][0],
            "auth_req_id": auth_req_id,
            "client_id": data.client_id,
            "nonce": nonce,
          }

          const response = await fetch('/ts43/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToken),
          });

          const body = await response.json();

          log_data({
            type: 'get_token_response',
            data: body,
          });

          window.location.href = '/user/info';
        }
      } catch(error) {
        alert(error.message);
      }
    } catch (error) {
      alert(error.message);
      console.log('error', error.message);
    }
  }

  async function start_sms_flow(data) {
    try {
      const response = await fetch('/sms/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if(!response.ok) {
        alert('AuthError: ' + response.statusText);
        return;
      }

      const body = await response.json();
      const { auth_req_id, nonce } = body;
      let otpAbortController = null;

      const otpResult = await Swal.fire({
        title: 'Enter OTP code',
        input: 'text',
        inputPlaceholder: 'OTP code',
        confirmButtonText: 'Enter',
        showCancelButton: true,
        cancelButtonText: 'Cancel',
        heightAuto: false,
        showLoaderOnConfirm: true,
        allowOutsideClick: () => !Swal.isLoading(),
        customClass: {
          popup: 'sms-otp-popup',
          title: 'sms-otp-title',
          input: 'sms-otp-input',
          actions: 'sms-otp-actions',
          confirmButton: 'sms-otp-confirm',
          cancelButton: 'sms-otp-cancel',
        },
        inputAttributes: {
          autocomplete: 'one-time-code',
          autocapitalize: 'off',
          autocorrect: 'off',
          inputmode: 'numeric',
          pattern: '[0-9]*'
        },
        didOpen: () => {
          const input = Swal.getInput();
          if (input) {
            input.addEventListener('input', function () {
              const sanitizedValue = sanitizeOtpValue(this.value);
              if (this.value !== sanitizedValue) {
                this.value = sanitizedValue;
              }
            });
          }

          otpAbortController = attachWebOtpToInput(
            () => Swal.getInput(),
            () => {
              if (!Swal.isLoading()) {
                Swal.clickConfirm();
              }
            }
          );
        },
        willClose: () => {
          if (otpAbortController) {
            otpAbortController.abort();
          }
        },
        inputValidator: (value) => {
          const sanitizedValue = sanitizeOtpValue(value);
          if (!sanitizedValue) {
            return 'Please enter OTP code';
          }
        },
        preConfirm: async (otpCode) => {
          const dataToken = {
            "code": sanitizeOtpValue(otpCode),
            "auth_req_id": auth_req_id,
            "client_id": data.client_id,
            "nonce": nonce,
            "server_id": data.server_id,
          };

          try {
            const tokenResponse = await fetch('/sms/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(dataToken),
            });

            const tokenBody = await tokenResponse.json();

            await log_sms_data({
              type: 'get_token_response',
              data: tokenBody,
            });

            if (!tokenResponse.ok) {
              Swal.showValidationMessage(tokenBody.data?.error_description || tokenBody.error || 'Unable to verify OTP code');
              return false;
            }

            return tokenBody;
          } catch (error) {
            Swal.showValidationMessage(error.message || 'Unable to verify OTP code');
            return false;
          }
        }
      });

      if (!otpResult.isConfirmed) {
        return;
      }

      window.location.href = '/user/info';
    } catch (error) {
      alert(error.message);
      console.log('error', error.message);
    }
  }

  async function log_data(data) {
    await fetch('/ts43/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: data }),
    });
  }

  async function log_sms_data(data) {
    await fetch('/sms/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: data }),
    });
  }

  $('#select').on('change', function () {
    var url = $(this).val();
    if (url) {
      window.location.href = url;
    }
  });

  $('input[name=phone]').on('input', function (e) {
    var phone = $(this)
      .val()
      .replace(/[^0-9]/g, '');
    $(this).val(phone);
    if (phone && phone != '') {
      $('.block-pnv').addClass('block-active');
    } else {
      $('.block-pnv').removeClass('block-active');
    }
  });

  $('input[name=phone_kyc]').on('input', function (e) {
    var phone = $(this)
      .val()
      .replace(/[^0-9]/g, '');
    $(this).val(phone);
    if (phone && phone != '') {
      $('.block-identity').addClass('block-active');
    } else {
      $('.block-identity').removeClass('block-active');
    }
  });

  if ($('#response_info').length > 0) {
    $('#response_info').modal('show');
  }

  $('#btnQrCode').on('click', function () {
    $('#qrcode').modal('show');
  });

  if ($('#error_alert').length > 0) {
    $('#error_alert').modal('show');
  }
  let hash = window.location.hash;
  const item = localStorage.getItem('selector');

  if (hash) {
    localStorage.removeItem('selector');
    window.location.href = hash;
    select_nav(hash.substring(1));
  } else if (!item) {
    location.hash = '#pnv';
  } else {
    window.location.href = '#' + item;
    select_nav(item);
  }
});

// console.log('window.hash', window.location.hash);

function select_nav(selector) {
  $('.phoneNumber').val('');
  $('.block-button').removeClass('block-active');
  $('.nav-link').removeClass('active');
  $('.nav-link-' + selector).addClass('active');
  $('.block').removeClass('active');
  $('.block-' + selector).addClass('active');
  localStorage.setItem('selector', selector);
}

$('#help').click(() => {
  const desktop = $(window).width() >= 576;
  if (desktop) {
    window.open(
      'https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf',
      'wwww',
      'width=' +
        parseInt(window.innerWidth) * 0.37 +
        ',height=' +
        parseInt(window.innerHeight) * 1 +
        'left=0,top=0',
    );
  } else {
    let newUrl = 'https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf';
    $('#help').attr('href', newUrl);
    $('#help').attr('target', '_blank');
  }
});

function showQrcodeWithLink(title, url, state) {
  // add event listener when scan qr code successful
  start_session_listener(state);

  Swal.fire({
    title: title,
    html: "<div class='qr-code-block'><div class='qrcode-title'>Scan QR code with your phone</div><div class='qrcode-img'></div></div>",
    showConfirmButton: false,
    showCloseButton: true,
    heightAuto: false,
    customClass: {
      popup: 'qrcode-popup',
    },
    didOpen: () => {
      var qrCodeElm = document.querySelector('.qr-code-block .qrcode-img');
      new QRCode(qrCodeElm, {
        text: url,
        width: 212,
        height: 212,
        correctLevel: QRCode.CorrectLevel.L,
      });
      qrCodeElm.setAttribute('title', '');
    },
  });
}

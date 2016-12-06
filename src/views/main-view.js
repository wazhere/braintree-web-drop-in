'use strict';

var BaseView = require('./base-view');
var classlist = require('../lib/classlist');
var CardView = require('./payment-sheet-views/card-view');
var CompletedView = require('./completed-view');
var isGuestCheckout = require('../lib/is-guest-checkout');
var PaymentOptionsView = require('./payment-options-view');
var PayPalView = require('./payment-sheet-views/paypal-view');
var supportsFlexbox = require('../lib/supports-flexbox');

function MainView() {
  BaseView.apply(this, arguments);

  this.dependenciesInitializing = 0;
  this.element = this.dropinWrapper;
  this._initialize();
}

MainView.prototype = Object.create(BaseView.prototype);
MainView.prototype.constructor = MainView;

MainView.prototype._initialize = function () {
  var completedView, paymentOptionsView, sheetContainer;
  var paymentMethods = this.model.getPaymentMethods();

  this.views = {};

  sheetContainer = this.getElementById('sheet-container');

  this.toggle = this.getElementById('toggle');
  this.alert = this.getElementById('alert');

  this.loadingContainer = this.getElementById('loading-container');
  this.loadingIndicator = this.getElementById('loading-indicator');
  this.dropinContainer = this.element.querySelector('.braintree-dropin');

  this.supportsFlexbox = supportsFlexbox();

  this.model.on('asyncDependenciesReady', this.hideLoadingIndicator.bind(this));
  this.model.on('loadBegin', this.showLoadingIndicator.bind(this));
  this.model.on('loadEnd', this.hideLoadingIndicator.bind(this));

  this.paymentSheetViewIDs = [
    CardView,
    PayPalView
  ].reduce(function (views, PaymentSheetView) {
    var paymentSheetView;

    if (PaymentSheetView.isEnabled(this.options)) {
      paymentSheetView = new PaymentSheetView({
        element: this.getElementById(PaymentSheetView.ID),
        mainView: this,
        model: this.model,
        options: this.options,
        strings: this.strings
      });

      this.addView(paymentSheetView);
      views.push(paymentSheetView.ID);
    }
    return views;
  }.bind(this), []);

  this.hasMultiplePaymentOptions = this.paymentSheetViewIDs.length > 1;

  completedView = new CompletedView({
    element: this.getElementById(CompletedView.ID),
    model: this.model,
    options: this.options,
    strings: this.strings
  });
  this.addView(completedView);

  this.toggle.addEventListener('click', this.toggleAdditionalOptions.bind(this));

  this.model.on('changeActivePaymentMethod', function () {
    this.setPrimaryView(CompletedView.ID);
  }.bind(this));

  this.model.on('changeActivePaymentOption', function (id) {
    if (id === CompletedView.ID) {
      classlist.add(completedView.element, 'braintree-completed--active');
      classlist.remove(sheetContainer, 'braintree-sheet--active');
    } else {
      classlist.add(sheetContainer, 'braintree-sheet--active');
      classlist.remove(completedView.element, 'braintree-completed--active');
    }
  });

  if (this.hasMultiplePaymentOptions) {
    paymentOptionsView = new PaymentOptionsView({
      element: this.getElementById(PaymentOptionsView.ID),
      mainView: this,
      paymentOptionIDs: this.paymentSheetViewIDs,
      strings: this.strings
    });

    this.addView(paymentOptionsView);
    this.setPrimaryView(paymentOptionsView.ID);
  } else {
    this.setPrimaryView(this.paymentSheetViewIDs[0]);
  }

  if (paymentMethods.length > 0) {
    this.model.changeActivePaymentMethod(paymentMethods[0]);
  }
};

MainView.prototype.addView = function (view) {
  this.views[view.ID] = view;
};

MainView.prototype.getView = function (id) {
  return this.views[id];
};

MainView.prototype.setPrimaryView = function (id) {
  this.dropinWrapper.className = prefixClass(id);
  this.primaryView = this.getView(id);
  this.model.changeActivePaymentOption(id);

  if (this.paymentSheetViewIDs.indexOf(id) !== -1) {
    if (!isGuestCheckout(this.options.authorization) || this.getView(PaymentOptionsView.ID)) {
      this.showToggle();
    } else {
      this.hideToggle();
    }
  } else if (id === CompletedView.ID) {
    this.showToggle();
  } else if (id === PaymentOptionsView.ID) {
    this.hideToggle();
  }

  if (!this.supportsFlexbox) {
    // TODO update no flex support
    this.dropinWrapper.className += ' braintree-dropin__no-flexbox';
  }

  this.model.clearError();
  this.model.endLoading();
};

MainView.prototype.requestPaymentMethod = function (callback) {
  var activePaymentView = this.getView(this.model.getActivePaymentOption());

  activePaymentView.requestPaymentMethod(function (err, payload) {
    if (err) {
      callback(err);
      return;
    }
    this.setPrimaryView(CompletedView.ID);
    callback(null, payload);
  }.bind(this));
};

MainView.prototype.showLoadingIndicator = function () {
  classlist.remove(this.loadingIndicator, 'braintree-loader__indicator--inactive');
  classlist.remove(this.loadingContainer, 'braintree-loader__container--inactive');
  classlist.add(this.dropinContainer, 'braintree-hidden');
};

MainView.prototype.hideLoadingIndicator = function () {
  setTimeout(function () {
    classlist.add(this.loadingIndicator, 'braintree-loader__indicator--inactive');
  }.bind(this), 200);

  setTimeout(function () {
    classlist.add(this.loadingContainer, 'braintree-loader__container--inactive');
    classlist.remove(this.dropinContainer, 'braintree-hidden');
  }.bind(this), 1000);
};

MainView.prototype.toggleAdditionalOptions = function () {
  this.hideToggle();
  if (!this.hasMultiplePaymentOptions && this.primaryView.ID === CompletedView.ID) {
    classlist.add(this.dropinWrapper, prefixClass(CardView.ID));
    this.model.changeActivePaymentOption(CardView.ID);
  } else if (this.hasMultiplePaymentOptions && this.paymentSheetViewIDs.indexOf(this.primaryView.ID) !== -1) {
    if (this.model.getPaymentMethods().length === 0) {
      this.setPrimaryView(PaymentOptionsView.ID);
    } else {
      this.setPrimaryView(CompletedView.ID);
      this.toggleAdditionalOptions();
    }
  } else {
    classlist.add(this.dropinWrapper, prefixClass(PaymentOptionsView.ID));
  }
};

MainView.prototype.showToggle = function () {
  classlist.remove(this.toggle, 'braintree-hidden');
};

MainView.prototype.hideToggle = function () {
  classlist.add(this.toggle, 'braintree-hidden');
};

MainView.prototype.showAlert = function (error) {
  var errorMessage;

  if (error && error.code && this.strings[snakeCaseToCamelCase(error.code) + 'Error']) {
    errorMessage = this.strings[snakeCaseToCamelCase(error.code) + 'Error'];
  } else {
    errorMessage = error.message || this.strings.genericError;
  }

  classlist.remove(this.alert, 'braintree-hidden');
  this.alert.textContent = errorMessage;
};

MainView.prototype.hideAlert = function () {
  classlist.add(this.alert, 'braintree-hidden');
};

MainView.prototype.teardown = function (callback) {
  var viewNames = Object.keys(this.views);
  var numberOfViews = viewNames.length;
  var viewsTornDown = 0;
  var error;

  viewNames.forEach(function (view) {
    this.views[view].teardown(function (err) {
      if (err) {
        error = err;
      }
      viewsTornDown += 1;

      if (viewsTornDown >= numberOfViews) {
        callback(error);
      }
    });
  }.bind(this));
};

function snakeCaseToCamelCase(s) {
  return s.toLowerCase().replace(/(\_\w)/g, function (m) {
    return m[1].toUpperCase();
  });
}

function prefixClass(classname) {
  return 'braintree-' + classname;
}

module.exports = MainView;

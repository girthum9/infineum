/*global QUnit*/

sap.ui.define([
	"accrual/controller/RequestPage.controller"
], function (Controller) {
	"use strict";

	QUnit.module("RequestPage Controller");

	QUnit.test("I should test the RequestPage controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});

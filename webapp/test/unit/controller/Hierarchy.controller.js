/*global QUnit*/

sap.ui.define([
	"pnp/hierarchyeditor/controller/Hierarchy.controller"
], function (oController) {
	"use strict";

	QUnit.module("Hierarchy Controller");

	QUnit.test("I should test the Hierarchy controller", function (assert) {
		var oAppController = new oController();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
sap.ui.define([
	"sap/ui/test/Opa5"
], function (Opa5) {
	"use strict";
	var sViewName = "Hierarchy";
	Opa5.createPageObjects({
		onTheAppPage: {

			actions: {},

			assertions: {

				iShouldSeeTheApp: function () {
					return this.waitFor({
						id: "idAppControl",
						viewName: sViewName,
						success: function () {
							Opa5.assert.ok(true, "The Hierarchy view is displayed");
						},
						errorMessage: "Did not find the Hierarchy view"
					});
				}
			}
		}
	});

});
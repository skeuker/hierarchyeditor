sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel"
], function(Controller, JSONModel) {
	"use strict";

	return Controller.extend("pnp.hierarchyeditor.controller.App", {
		onInit: function() {
			
			//create this controller's ViewModel
			this.oViewModel = new JSONModel({
				layout: "TwoColumnsMidExpanded"
			});
			
			//set view model to owner component
			this.getOwnerComponent().setModel(this.oViewModel, "AppViewModel");
			
			//set view model to view
			this.getView().setModel(this.oViewModel, "AppViewModel");

		}
	});
});
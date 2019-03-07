sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel"
], function(BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("pnp.hierarchyeditor.controller.Message", {

		//initialize this controller
		onInit: function() {

			//create view model and set on view
			this.oViewModel = new JSONModel({});
			this.getView().setModel(this.oViewModel, "MessageViewModel");

			//attach display event handler
			this.getRouter().getTarget("Message").attachDisplay(this.onDisplay, this);

		},

		//display message page
		onDisplay: function(oEvent) {

			//local data declaration
			var sMessageIcon, sMessageDescription;

			//get full ID of message page
			var sMessagePageID = this.getView().getId();

			//get access to flexible column layout instance
			var oFlexColumnLayout = this.getOwnerComponent().oAppController.getView().byId("FlexibleColumnLayout");

			//navigate to message page in EndColumnAggregation of flexible column layout
			oFlexColumnLayout.toEndColumnPage(sMessagePageID, "slide");

			//adopt message text from navigation
			var oNavData = oEvent.getParameter("data");

			//set view model message text attribute
			this.oViewModel.setProperty("/sMessageText", oNavData.messageText);

			//derive message icon
			switch (oNavData.messageType) {
				case "Success":
					sMessageIcon = "sap-icon://message-success";
					sMessageDescription = this.getResourceBundle().getText("messageDescriptionProcessedSuccessfully");
					break;
				case "Error":
					sMessageIcon = "sap-icon://message-error";
					sMessageDescription = this.getResourceBundle().getText("messageDescriptionOopsSomethingWentWrong");
					break;
				case "Warning":
					sMessageIcon = "sap-icon://message-warning";
					sMessageDescription = this.getResourceBundle().getText("messageDescriptionForYourInformation");
					break;
				case "Information":
					sMessageIcon = "sap-icon://message-information";
					sMessageDescription = this.getResourceBundle().getText("messageDescriptionForYourInformation");
					break;
			}

			//set view model message icon and description attribute
			this.oViewModel.setProperty("/sMessageDescription", sMessageDescription);
			this.oViewModel.setProperty("/sMessageIcon", sMessageIcon);

		}

	});

});
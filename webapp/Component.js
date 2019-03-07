sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"pnp/hierarchyeditor/model/models",
	"pnp/hierarchyeditor/util/ListSelector",
	"pnp/hierarchyeditor/util/ErrorHandler"
], function(UIComponent, Device, models, ListSelector, ErrorHandler) {
	"use strict";

	return UIComponent.extend("pnp.hierarchyeditor.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function() {

			//initialize component attributes
			this.oListSelector = new ListSelector();
			this.oErrorHandler = new ErrorHandler(this);

			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// enable routing
			this.getRouter().initialize();

			// set the device model
			this.setModel(models.createDeviceModel(), "device");

		},

		/*The following methods are for inter-component communication
		  between the hierarchy editor and its connected hierarchy*/

		//on hierarchy item save from attributes view
		onSaveOfHierarchyItem: function(oHierarchyItem) {

			//construct hierarchy item OData path
			var sHierarchyItemODataPath = "/" + this.getModel("HierarchyModel").createKey("HierarchyNodes", {
				HierarchyID: oHierarchyItem.HierarchyID,
				HierarchyNodeID: oHierarchyItem.HierarchyNodeID
			});

			/*read service model entity to update related hierarchy node text
			  Explicitly no exception handling as failure here is not critical*/
			this.getModel("HierarchyModel").read(sHierarchyItemODataPath, {});

		},

		//reset attributes view
		unbindAttributesView: function() {

			//unbind attributes view service hierarchy OData model
			this.oAttributesController.getView().unbindElement("ServiceModel");
			
		}

	});

});
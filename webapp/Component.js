sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"pnp/hierarchyeditor/model/models",
	"pnp/hierarchyeditor/util/ListSelector",
	"pnp/hierarchyeditor/util/ErrorHandler"
], function (UIComponent, Device, models, ListSelector, ErrorHandler) {
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
		init: function () {
			
			//initialize component attributes
			this.oListSelector = new ListSelector();
			this.oErrorHandler = new ErrorHandler(this);
			
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// enable routing
			this.getRouter().initialize();

			// set the device model
			this.setModel(models.createDeviceModel(), "device");
			
		}
		
	});
	
});
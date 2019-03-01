/*global history */
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/routing/History",
	"pnp/hierarchyeditor/util/ErrorHandler",
	"pnp/hierarchyeditor/util/uuid"
], function(Controller, History, ErrorHandler, uuid) {
	"use strict";

	return Controller.extend("pnp.blockandreplace.controller.Base", {
		/**
		 * Convenience method for accessing the router in every controller of the application.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function() {
			return this.getOwnerComponent().getRouter();
		},

		/**
		 * Convenience method for getting the view model by name in every controller of the application.
		 * @public
		 * @param {string} sName the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function(sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model in every controller of the application.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function(oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Convenience method for getting the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function() {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry we go one step back in the browser history
		 * If not, it will replace the current entry of the browser history with the master route.
		 * @public
		 */
		onNavBack: function() {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		/**
		 * Gets a UUID as a unique ID at runtime formatted
		 * in such way that it is acceptable as SAP GUID
		 * @public
		 */
		getGUID: function() {

			/*return version1 UUID, removing formatting hyphens, 
			converting to upper case to match a SAP GUID*/
			return window.uuid.v1().replace(/-/g, "").toUpperCase();

		},

		/**
		 * Gets a UUID as a unique ID at runtime formatted
		 * in such way that it is acceptable as SAP GUID
		 * @public
		 */
		getUUID: function() {

			/*return version1 UUID, removing formatting hyphens, 
			converting to upper case to match a SAP GUID*/
			return window.uuid.v1().replace(/-/g, "").toUpperCase();

		},

		/**
		 * Send message using message strip
		 * @private
		 */
		sendStripMessage: function(sText, sType, oMessageStrip) {

			//adopt message strip for issuing message
			if (!oMessageStrip) {
				oMessageStrip = this.oMessageStrip;
			}

			//message handling: send message
			oMessageStrip.setText(sText);
			oMessageStrip.setType(sType);
			oMessageStrip.setVisible(true);

		},

		//set entity messages
		setEntityMessages: function(aMessages) {

			//remove all messages from the message manager
			this.oMessageManager.removeAllMessages();

			//add messages to message popover
			aMessages.forEach(function(oMessage) {
				this.oMessageManager.addMessages(
					new sap.ui.core.message.Message({
						message: oMessage.MessageText,
						description: "Take note",
						code: oMessage.MessageCode,
						type: oMessage.MessageType,
						processor: this.oMessageProcessor
					})
				);
			}.bind(this));

		},

		//prepare message popover for display
		prepareMessagePopoverForDisplay: function() {

			//construct popover for message display
			var oMessagePopover = new sap.m.MessagePopover({

				//messages in item aggregation
				items: {
					path: "MessageModel>/",
					template: new sap.m.MessagePopoverItem({
						type: "{MessageModel>type}",
						title: "{MessageModel>message}",
						description: "{MessageModel>description}"
					})
				},

				//destroy after close
				afterClose: function() {
					oMessagePopover.destroy();
				}

			});

			//connect message popover to message model
			oMessagePopover.setModel(this.oMessageManager.getMessageModel(), "MessageModel");

			//feedback to caller
			return oMessagePopover;

		},

		/**
		 * Messages button press event handler
		 * @function
		 * @private
		 */
		onMessagesButtonPress: function(oEvent) {

			//initialize variables
			var oMessagesButton = oEvent.getSource();

			//prepare message popover for display
			var oMessagePopover = this.prepareMessagePopoverForDisplay();

			//toggle message popover display
			oMessagePopover.toggle(oMessagesButton);

		},

		//render OData error response to detail message page
		renderODataErrorResponseToDetailMessagePage: function(oError) {

			//set view to no longer busy
			this.oViewModel.setProperty("/busy", false);

			// set the layout property of flexible column layout control to show two columns
			this.getModel("AppViewModel").setProperty("/layout", "TwoColumnsMidExpanded");

			//clear master list selection state
			this.getOwnerComponent().oListSelector.clearMasterListSelection();

			//get message text
			var sMessageText = ErrorHandler.prototype.getODataErrorResponseMessageText.call(this, oError);

			//error encountered
			this.getRouter().getTargets().display("detailObjectMessage", {
				messageText: sMessageText,
				messageType: "Error"
			});

		},

		//render OData error response 
		renderODataErrorResponse: function(oError, sStripMessageI18nID) {

			//message handling: update failed
			this.sendStripMessage(this.getResourceBundle().getText(sStripMessageI18nID), sap.ui.core.MessageType.Error);

			//get message text
			var sMessageText = ErrorHandler.prototype.getODataErrorResponseMessageText.call(this, oError);

			//set message to message popover button
			this.setEntityMessages([{
				MessageText: sMessageText,
				MessageType: "Error"
			}]);

			//set view to no longer busy
			this.oViewModel.setProperty("/isViewBusy", false);

		},

		//render OData error response to message popover button
		renderODataErrorResponseToMessagePopoverButton: function(oError) {

			//get message text
			var sMessageText = ErrorHandler.prototype.getODataErrorResponseMessageText.call(this, oError);

			//set message to message popover button
			this.setEntityMessages([{
				MessageText: sMessageText,
				MessageType: "Error"
			}]);

		},

		//check for and visualize errors in BatchResponses
		hasODataBatchErrorResponse: function(aBatchResponses) {

			//local data declaration
			var oMessage = {};
			var aMessages = [];

			//no further processing where input not type compliant
			if (!Array.isArray(aBatchResponses)) {
				return false;
			}

			//for each batchResponse
			aBatchResponses.forEach(function(oBatchResponse) {

				//where a batchResponse is contained
				if (oBatchResponse.response) {

					//in case of errors
					if (/^4/.test(oBatchResponse.response.statusCode) ||
						/^5/.test(oBatchResponse.response.statusCode)) {

						//interprese backend error
						if (oBatchResponse.response.body) {

							//for exception handling
							try {

								//parse response body containing error
								var oResponseBody = JSON.parse(oBatchResponse.response.body);

								//construct message
								if (oResponseBody.error) {

									//adopt error attributes into message	
									oMessage.MessageText = oResponseBody.error.message.value;
									oMessage.MessageCode = oResponseBody.error.code;
									oMessage.MessageType = "Error";

									//push to messages array
									aMessages.push(oMessage);

								}

								//exception handling: failed to parse
							} catch (oException) {
								//explicitly none
							}

						}

					}

				}

			});

			//message handling
			if (aMessages.length > 0) {

				//set messages to message popover button
				this.setEntityMessages(aMessages);

				//set view to no busy
				this.oViewModel.setProperty("/busy", false);

				//feedback to caller: errors occured
				return true;

			}

			//feedback to caller: no errors occured
			return false;

		},

		/**
		 * @function getFormInputFields
		 * @description Gets form input fields in a given form
		 * @param {sap.ui.layout.form} oForm the form in the view.
		 * @public
		 */
		getFormInputFields: function(oForm) {

			//local data declaration
			var aInputControl = [];

			//get all visible fields in this form
			var aControls = this.getFormFields(oForm, false);

			//reduce all form fields to input
			aControls.forEach(function(item) {

				//get reference to this UI control
				var oControl = item.oControl;
				var sControlType = oControl.getMetadata().getName();

				//for controls allowing input
				if (sControlType === "sap.m.Input" ||
					sControlType === "sap.m.Switch" ||
					sControlType === "sap.m.Select" ||
					sControlType === "sap.m.CheckBox" ||
					sControlType === "sap.m.ComboBox" ||
					sControlType === "sap.m.RadioButton" ||
					sControlType === "sap.m.DateTimeInput" ||
					sControlType === "sap.m.RadioButtonGroup" ||
					sControlType === "sap.m.UploadCollection" ||
					sControlType === "sap.ui.unified.FileUploader" ||
					sControlType === "sap.m.MultiComboBox" ||
					sControlType === "sap.m.DatePicker" ||
					sControlType === "sap.m.Table" ||
					sControlType === "sap.m.List") {

					//keep track of this control as input control
					aInputControl.push(item);

				}

			});

			//feedback to caller
			return aInputControl;

		},

		/**
		 * Gets form action fields in a given form
		 * @param {sap.ui.layout.form} oSimpleForm the form in the view.
		 * @public
		 */
		getFormActionFields: function(oForm) {

			//local data declaration
			var aActionControl = [];

			//get all fields in this form
			var aControls = this.getFormFields(oForm);

			//reduce all form fields to take action
			aControls.forEach(function(item) {

				//get reference to this UI control
				var oControl = item.oControl;
				var sControlType = oControl.getMetadata().getName();

				//for controls allowing to take action
				if (sControlType === "sap.m.Button") {

					//keep track of this control as input control
					aActionControl.push(item);

				}

			});

			//feedback to caller
			return aActionControl;

		},

		/**
		 * @function getFormFields
		 * @description Reuse method to get form fields in a given form
		 * @param {sap.ui.layout.form} oForm the form in the view
		 * @param {boolean} bInvisible Choose to include invisible form fields
		 * @public
		 */
		getFormFields: function(oForm, bInvisible) {

			//Local data declaration
			var aControls = [];
			var aFormContainerElementFields = [];

			//get form ID for further reference
			var sFormID = oForm.getId().match(/[^-]*$/)[0];

			//Get form containers contained in this form
			var aFormContainers = oForm.getFormContainers();

			//for each form container
			for (var i = 0; i < aFormContainers.length; i++) {

				//get form elements in this form container
				var aFormElements = aFormContainers[i].getFormElements();

				//for each form element in this form container
				for (var j = 0; j < aFormElements.length; j++) {

					//get form fields in this form element
					var oFormElement = aFormElements[j];
					var aFormFields = oFormElement.getFields();
					var oFormLabel = oFormElement.getLabel();

					//include fields if form element is visible
					if (oFormElement.getVisible() || bInvisible) {

						//for each field in this form element
						for (var n = 0; n < aFormFields.length; n++) {

							//include field that is visiblie
							if (aFormFields[n].getVisible() || bInvisible) {

								//composite field
								if (aFormFields[n].getMetadata().getName() === "sap.m.HBox") {
									var aFlexBoxFormField = aFormFields[n].getItems();
									aFlexBoxFormField.forEach(function(item) {
										aFormContainerElementFields.push({
											sId: item.getId().match(/[^-]*$/)[0],
											oControl: item,
											oLabel: oFormLabel
										});
									});
								}

								//simple fields
								aFormContainerElementFields.push({
									sId: aFormFields[n].getId().match(/[^-]*$/)[0],
									oControl: aFormFields[n],
									oLabel: oFormLabel
								});

							}

						}

					}

				}

			}

			//build array of form field controls
			for (i = 0; i < aFormContainerElementFields.length; i++) {

				//establish whether this form field requires input
				var bIsRequired;
				if (aFormContainerElementFields[i].oLabel) {
					bIsRequired = aFormContainerElementFields[i].oLabel.getRequired();
				} else {
					bIsRequired = false;
				}

				//keep track of this form field
				aControls.push({
					sId: aFormContainerElementFields[i].sId,
					oControl: aFormContainerElementFields[i].oControl,
					oLabel: aFormContainerElementFields[i].oLabel,
					bRequired: bIsRequired,
					sFormID: sFormID
				});

			}

			//feedback to caller
			return aControls;

		},

		/**
		 * Validates all required form fields have input and input is valid
		 * Returns first invalid input control where applicable
		 * @private
		 */
		isValid: function(aForms) {

			//check for missing input
			if (this.hasMissingInput(aForms).length > 0) {
				return false;
			}

			//check for invalid input
			if (this.hasInvalidInput(aForms).length > 0) {
				return false;
			}

			//check for error messages
			if (this.hasErrorMessages()) {
				return false;
			}

			//input is valid
			return true;

		},

		//return all controls that miss required or carry invalid input
		hasIncorrectInput: function(aForms, oControl) {

			//local data declaration
			var sMessageDetails;

			//reset value state of input controls on validated form(s)
			aForms.forEach(function(oForm) {

				//leaving to next iteration when form not bound
				if (!oForm) {
					return;
				}

				//for each form input field
				this.getFormInputFields(oForm).forEach(function(item) {

					//reset value state for single value input controls
					if (item.oControl.getMetadata().getName() !== "sap.m.List" &&
						item.oControl.getMetadata().getName() !== "sap.m.Table" &&
						item.oControl.getMetadata().getName() !== "sap.m.Switch" &&
						item.oControl.getMetadata().getName() !== "sap.m.CheckBox" &&
						item.oControl.getMetadata().getName() !== "sap.m.UploadCollection") {
						item.oControl.setValueState(sap.ui.core.ValueState.None);
					}

					//reset value state for list input controls
					if (item.oControl.getMetadata().getName() === "sap.m.List") {

						//in each list item reset value state for all single value input controls 
						item.oControl.getItems().forEach(function(oListItem) {
							oListItem.getAggregation("content").forEach(function(oListItemControl) {
								if (oListItemControl.setValueState) {
									oListItemControl.setValueState(sap.ui.core.ValueState.None);
								}
							});
						}.bind(this));

					}
				});

			}.bind(this));

			//remove all existing messages from the message manager where applicable
			if (!this.oMessageManager.containsLeadingMessage) {
				this.oMessageManager.containsLeadingMessage = false;
				this.oMessageManager.removeAllMessages();
			}

			//missing input on the requested forms
			var aMissingInput = this.hasMissingInput(aForms, oControl);

			//missing input is present
			if (aMissingInput.length > 0) {

				//message handling: missing input
				aMissingInput.forEach(function(oMissingInput) {
					if (oMissingInput.oLabel) {
						var sMessage = oMissingInput.oLabel.getText() + " is a required field";
						this.oMessageManager.addMessages(
							new sap.ui.core.message.Message({
								message: sMessage,
								code: oMissingInput.sFormID,
								description: "Validation failed: Required input is missing",
								type: sap.ui.core.MessageType.Error,
								processor: this._oMessageProcessor
							})
						);
					}
				}.bind(this));

			}

			//invalid input on the requested forms
			if (this.hasInvalidInput) {
				var aInvalidInput = this.hasInvalidInput(aForms, oControl);
			}

			//invalid input is present
			if (aInvalidInput && aInvalidInput.length > 0) {

				//message handling: invalid input
				aInvalidInput.forEach(function(oInvalidInput) {
					if (oInvalidInput.oLabel) {
						var sMessage = oInvalidInput.oLabel.getText() + " validation failed";
						if (oInvalidInput.sInvalidInputMessage) {
							sMessageDetails = oInvalidInput.sInvalidInputMessage;
						} else {
							sMessageDetails = this.oResourceBundle.getText("messageInvalidInputCorrectYourEntry");
						}
						this.oMessageManager.addMessages(
							new sap.ui.core.message.Message({
								message: sMessage,
								code: oInvalidInput.sFormID,
								description: sMessageDetails,
								type: sap.ui.core.MessageType.Error,
								processor: this._oMessageProcessor
							})
						);
					}
				}.bind(this));

			}

			//feedback to caller
			if (aMissingInput.length > 0 || ( aInvalidInput && aInvalidInput.length > 0 )) {
				return {
					"missingInput": aMissingInput,
					"invalidInput": aInvalidInput
				};
			} else {
				return null;
			}

		},

		/**
		 * Validates all required form input controls have input
		 * @private
		 */
		hasMissingInput: function(aForms, oControl) {

			//local data declaration
			var aFormFields = [];
			var aMissingFormFields = [];

			//check required input available in this array of forms
			aForms.forEach(function(oForm) {

				//leaving to next iteration when form not bound
				if (!oForm) {
					return;
				}

				//get form input controls
				aFormFields = this.getFormInputFields(oForm);

				//check that all required fields have values
				for (var m = 0; m < aFormFields.length; m++) {

					//get reference to this UI control
					var oInputControl = aFormFields[m].oControl;
					var sControlType = oInputControl.getMetadata().getName();

					//for controls allowing input
					if ((sControlType === "sap.m.Input" ||
							sControlType === "sap.m.DateTimeInput" ||
							sControlType === "sap.ui.unified.FileUploader" ||
							sControlType === "sap.m.DatePicker") &&
						aFormFields[m].oControl.getVisible() &&
						aFormFields[m].bRequired) {

						//get value to this input control
						var sValue = oInputControl.getValue();

						//controls with required input to contain a non-white-space value
						if (!sValue || /^\s+$/.test(sValue)) {
							aMissingFormFields.push(aFormFields[m]);
						}

					}

					//for controls allowing input
					if (sControlType === "sap.m.CheckBox" &&
						aFormFields[m].oControl.getVisible() &&
						aFormFields[m].bRequired) {

						//get selected state
						var sValue = oInputControl.getSelected();

						//a checkbox will not be considered missing input if initial

					}

					//for controls allowing selection of a key value
					if ((sControlType === "sap.m.ComboBox" ||
							sControlType === "sap.m.Select") &&
						aFormFields[m].oControl.getVisible() &&
						aFormFields[m].bRequired) {

						//get value to this input control
						var sKey = oInputControl.getSelectedKey();

						//controls with required required selected key
						if (!sKey || /^\s+$/.test(sKey)) {
							aMissingFormFields.push(aFormFields[m]);
						}

					}

					//for controls allowing selection of multiple key values
					if (sControlType === "sap.m.MultiComboBox" &&
						aFormFields[m].oControl.getVisible() &&
						aFormFields[m].bRequired) {

						//get value to this input control
						var aKeys = oInputControl.getSelectedKeys();

						//controls at least one required key selection
						if (!aKeys.length > 0) {
							aMissingFormFields.push(aFormFields[m]);
						}

					}

					//for control allowing list item entry
					if (sControlType === "sap.m.List" &&
						aFormFields[m].oControl.getVisible() &&
						aFormFields[m].bRequired) {

						//get value to this input control
						var aItems = oInputControl.getItems();

						//list has to have at least one entry
						if (!aItems.length > 0) {
							aMissingFormFields.push(aFormFields[m]);
						}

					}

				}

			}.bind(this));

			//set value state for all or only specified control
			aMissingFormFields.forEach(function(oFormField) {
				if (!oControl || oControl === oFormField.oControl) {
					if (typeof oFormField.oControl.setValueState === "function") {
						oFormField.oControl.setValueState(sap.ui.core.ValueState.Error);
					}
					if (typeof oFormField.oControl.setValueStateText === "function") {
						oFormField.oControl.setValueStateText(this.oResourceBundle.getText("messageInvalidInputRequiredFields"));
					}
				}
			}.bind(this));

			//return control with missing input
			return aMissingFormFields;

		},

		/**
		 * Checks for error messages bound in model
		 * @private
		 */
		hasErrorMessages: function() {

			//to be implemented in extension controller derived from base controller
			return false;

		},

		//resetting form input fields
		resetFormInput: function(oForm, oFormField) {

			//get all formfields in this form
			var aFormFields = this.getFormFields(oForm, true);

			//set initial value for all contained input controls
			for (var m = 0; m < aFormFields.length; m++) {

				//where formfield not excluded from reset
				if (aFormFields[m].oControl !== oFormField) {

					//enable input controls
					var sControlType = aFormFields[m].oControl.getMetadata().getName();
					if (sControlType === "sap.m.Input" ||
						sControlType === "sap.m.DateTimeInput" ||
						sControlType === "sap.m.RadioButtonGroup" ||
						sControlType === "sap.m.DatePicker") {
						aFormFields[m].oControl.setValue("");
					}
					if (sControlType === "sap.m.ComboBox") {
						aFormFields[m].oControl.setSelectedKey(null);
					}
					if (sControlType === "sap.m.CheckBox") {
						aFormFields[m].oControl.setSelected(false);
					}
					if (sControlType === "sap.m.ComboBox") {
						aFormFields[m].oControl.setSelectedKey(null);
					}

				}

			}

		},

		//set 'enabled' state of form input controls
		setFormInputControlsEnabled: function(aForms, bEnabled) {

			//get entity identity form inputs
			if (this.getIdentityFormInputs) {
				this.aIdentityFormInputs = this.getIdentityFormInputs();
			}

			//for each requested form
			aForms.forEach(function(oForm) {

				//get all input fields in this form
				var aInputControls = this.getFormInputFields(oForm);

				//exclude entity identity form inputs where enabling
				if (bEnabled && this.aIdentityFormInputs) {

					//reduce form input controls to non-identity form inputs
					var aInputControlsNonIdentity = aInputControls.filter(function(oInputControl) {

						//local data declaration
						var isIdentityControl = false;

						//check whether this input control is an identity control
						this.aIdentityFormInputs.forEach(function(oIdentityInputControl) {
							if (oInputControl.oControl === oIdentityInputControl) {
								isIdentityControl = true;
							}
						});

						//input control is part of entity identity
						if (isIdentityControl) {
							return false;
						}

						//input control is not an identity attribute
						return true;

					}.bind(this));

					//adopt non-identity input controls for setting input controls enabled state
					aInputControls = aInputControlsNonIdentity;

				}

				//set enabled state for all input controls
				aInputControls.forEach(function(item) {

					//get reference to this UI control
					var oControl = item.oControl;
					var sControlType = oControl.getMetadata().getName();

					//for controls allowing input or action
					if (sControlType === "sap.m.Input" ||
						sControlType === "sap.m.Switch" ||
						sControlType === "sap.m.Select" ||
						sControlType === "sap.m.CheckBox" ||
						sControlType === "sap.m.ComboBox" ||
						sControlType === "sap.m.RadioButton" ||
						sControlType === "sap.m.MultiComboBox" ||
						sControlType === "sap.m.DateTimeInput" ||
						sControlType === "sap.m.RadioButtonGroup" ||
						sControlType === "sap.ui.unified.FileUploader" ||
						sControlType === "sap.m.DatePicker") {

						//set enabled state
						oControl.setEnabled(bEnabled);

					}

					//for table and lists with header toolbar and items
					if (sControlType === "sap.m.Table" ||
						sControlType === "sap.m.List") {

						//toggle header toolbar state where available
						var oToolbar = oControl.getHeaderToolbar();
						if (oToolbar) {
							oToolbar.setEnabled(bEnabled);
						}

						//get list or table items
						var aItems = oControl.getItems();

						//for each table or list item
						aItems.forEach(function(oItem) {

							//set list item type active or inactive
							switch (bEnabled) {
								case false:
									oItem.setType(sap.m.ListType.Inactive);
									break;
								case true:
									oItem.setType(sap.m.ListType.Active);
									break;
							}

							//for each control in list item content aggregation
							if (sControlType === "sap.m.List") {
								var aControls = oItem.getAggregation("content");
								aControls.forEach(function(oListItemControl) {
									if (oListItemControl.setEnabled) {
										oListItemControl.setEnabled(bEnabled);
									} else {
										oListItemControl.setVisible(bEnabled);
									}
								});
							}

							//toggle display for last cell in table 
							if (sControlType === "sap.m.Table") {
								var aCells = oItem.getAggregation("cells");
								aCells[aCells.length - 1].setVisible(bEnabled);
							}

						});

					}

					//for upload collections set upload enabled state
					if (sControlType === "sap.m.UploadCollection") {
						oControl.setUploadEnabled(bEnabled);

						//get upload collection toolbar
						var oUploadCollectionToolbar = oControl.getToolbar();
						if (!oUploadCollectionToolbar) {
							oUploadCollectionToolbar = oControl.getAggregation("toolbar");
						}

						//set enabled state for all toolbar controls
						oUploadCollectionToolbar.getAggregation("content").forEach(function(oToolbarControl) {
							if (oToolbarControl.setEnabled) {
								oToolbarControl.setEnabled(bEnabled);
							}
						});

						//set enabled state for each item in upload collection
						aItems = oControl.getItems();
						aItems.forEach(function(oItem) {
							oItem.setEnableDelete(bEnabled);
							oItem.setEnableEdit(bEnabled);
						});
					}

				});

			}.bind(this));

		},

		//set 'enabled' state of form action controls
		setFormActionControlsEnabled: function(aForms, bEnabled) {

			//for each requested form
			aForms.forEach(function(oForm) {

				//get all action fields in this form
				var aActionControls = this.getFormActionFields(oForm);

				//set enabled state for all action controls
				aActionControls.forEach(function(item) {

					//get reference to this UI control
					var oControl = item.oControl;
					var sControlType = oControl.getMetadata().getName();

					//for controls allowing input or action
					if (sControlType === "sap.m.Button") {

						//set enabled state
						oControl.setEnabled(bEnabled);

					}

				});

			}.bind(this));

		}

	});

});
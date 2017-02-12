'use strict';

import cx from 'classnames';
import {find, isEqual, noop} from 'lodash';
import onClickOutside from 'react-onclickoutside';
import React, {PropTypes} from 'react';

import ClearButton from './ClearButton';
import Loader from './Loader';
import Overlay from './Overlay';
import TokenizerInput from './TokenizerInput';
import TypeaheadInput from './TypeaheadInput';
import TypeaheadMenu from './TypeaheadMenu';

import addCustomOption from './utils/addCustomOption';
import defaultFilterBy from './utils/defaultFilterBy';
import getHintText from './utils/getHintText';
import getInputText from './utils/getInputText';
import getOptionLabel from './utils/getOptionLabel';
import getTruncatedOptions from './utils/getTruncatedOptions';
import warn from './utils/warn';

import {DOWN, ESC, RETURN, TAB, UP} from './utils/keyCode';

/**
 * Typeahead
 */
const Typeahead = React.createClass({
  displayName: 'Typeahead',

  propTypes: {
    /**
     * Allows the creation of new selections on the fly. Note that any new items
     * will be added to the list of selections, but not the list of original
     * options unless handled as such by `Typeahead`'s parent.
     */
    allowNew: PropTypes.bool,
    /**
     * Autofocus the input when the component initially mounts.
     */
    autoFocus: PropTypes.bool,
    /**
     * Whether to render the menu inline or attach to `document.body`.
     */
    bodyContainer: PropTypes.bool,
    /**
     * Whether or not filtering should be case-sensitive.
     */
    caseSensitive: PropTypes.bool,
    /**
     * Displays a button to clear the input when there are selections.
     */
    clearButton: PropTypes.bool,
    /**
     * Specify any pre-selected options. Use only if you want the component to
     * be uncontrolled.
     */
    defaultSelected: PropTypes.array,
    /**
     * String set as default value
     */
    defaultText: PropTypes.string,
    /**
     * Specify whether the menu should appear above the input.
     */
    dropup: PropTypes.bool,
    /**
     * Either an array of fields in `option` to search, or a custom filtering
     * callback.
     */
    filterBy: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.string.isRequired),
      PropTypes.func,
    ]),
    /**
     * Whether the filter should ignore accents and other diacritical marks.
     */
    ignoreDiacritics: PropTypes.bool,
    /**
     * Indicate whether an asynchromous data fetch is happening.
     */
    isLoading: PropTypes.bool,
    /**
     * Specify the option key to use for display or a function returning the
     * display string. By default, the selector will use the `label` key.
     */
    labelKey: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.func,
    ]),
    /**
     * Maximum number of results to display by default. Mostly done for
     * performance reasons so as not to render too many DOM nodes in the case of
     * large data sets.
     */
    maxResults: PropTypes.number,
    /**
     * Number of input characters that must be entered before showing results.
     */
    minLength: PropTypes.number,
    /**
     * Whether or not multiple selections are allowed.
     */
    multiple: PropTypes.bool,
    /**
     * Callback fired when the input is blurred. Receives an event.
     */
    onBlur: PropTypes.func,
    /**
     * Callback fired whenever items are added or removed. Receives an array of
     * the selected options.
     */
    onChange: PropTypes.func,
    /**
     * Callback fired when the input is focused. Receives an event.
     */
    onFocus: PropTypes.func,
    /**
     * Callback for handling changes to the user-input text.
     */
    onInputChange: PropTypes.func,
    /**
     * Full set of options, including pre-selected options. Must either be an
     * array of objects (recommended) or strings.
     */
    options: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.object.isRequired),
      PropTypes.arrayOf(PropTypes.string.isRequired),
    ]).isRequired,
    /**
     * Give user the ability to display additional results if the number of
     * results exceeds `maxResults`.
     */
    paginate: PropTypes.bool,
    /**
     * Callback for custom menu rendering.
     */
    renderMenu: PropTypes.func,
    /**
     * The selected option(s) displayed in the input. Use this prop if you want
     * to control the component via its parent.
     */
    selected: PropTypes.array,
  },

  getDefaultProps() {
    return {
      allowNew: false,
      autoFocus: false,
      bodyContainer: false,
      caseSensitive: false,
      clearButton: false,
      defaultSelected: [],
      defaultText: '',
      dropup: false,
      filterBy: [],
      ignoreDiacritics: true,
      isLoading: false,
      labelKey: 'label',
      maxResults: 100,
      minLength: 0,
      multiple: false,
      onBlur: noop,
      onChange: noop,
      onFocus: noop,
      onInputChange: noop,
      paginate: true,
      selected: [],
    };
  },

  childContextTypes: {
    activeIndex: PropTypes.number.isRequired,
    onActiveItemChange: PropTypes.func.isRequired,
    onInitialItemChange: PropTypes.func.isRequired,
    onMenuItemClick: PropTypes.func.isRequired,
  },

  getChildContext() {
    return {
      activeIndex: this.state.activeIndex,
      onActiveItemChange: this._handleActiveItemChange,
      onInitialItemChange: this._handleInitialItemChange,
      onMenuItemClick: this._handleAddOption,
    };
  },

  getInitialState() {
    const {defaultSelected, maxResults, defaultText} = this.props;

    let selected = this.props.selected.slice();
    if (defaultSelected && defaultSelected.length) {
      selected = defaultSelected;
    }

    return {
      activeIndex: -1,
      activeItem: null,
      initialItem: null,
      selected,
      showMenu: false,
      shownResults: maxResults,
      text: defaultText,
    };
  },

  componentWillMount() {
    const {
      allowNew,
      caseSensitive,
      filterBy,
      ignoreDiacritics,
      labelKey,
    } = this.props;

    warn(
      !(typeof filterBy === 'function' && (caseSensitive || !ignoreDiacritics)),
      'Your `filterBy` function will override the `caseSensitive` and ' +
      '`ignoreDiacritics` props.'
    );

    warn(
      !(typeof labelKey === 'function' && allowNew),
      '`labelKey` must be a string if creating new options is allowed.'
    );
  },

  componentDidMount() {
    this.props.autoFocus && this.focus();
  },

  componentWillReceiveProps(nextProps) {
    const {multiple, selected} = nextProps;

    if (!isEqual(selected, this.props.selected)) {
      // If new selections are passed in via props, treat the component as a
      // controlled input.
      this.setState({selected});
    }

    if (multiple !== this.props.multiple) {
      this.setState({text: ''});
    }
  },

  render() {
    const {allowNew, className, dropup, labelKey, paginate} = this.props;
    const {shownResults, text} = this.state;

    // First filter the results by the input string.
    let results = this._getFilteredResults();

    // This must come before we truncate.
    const shouldPaginate = paginate && results.length > shownResults;

    // Truncate if necessary.
    if (shouldPaginate) {
      results = getTruncatedOptions(results, shownResults);
    }

    // Add the custom option.
    if (allowNew) {
      results = addCustomOption(results, text, labelKey);
    }

    return (
      <div
        className={cx('bootstrap-typeahead', 'open', {
          'dropup': dropup,
        }, className)}
        style={{position: 'relative'}}>
        {this._renderInput(results)}
        {this._renderAux()}
        {this._renderMenu(results, shouldPaginate)}
      </div>
    );
  },

  _getFilteredResults() {
    const {
      caseSensitive,
      filterBy,
      ignoreDiacritics,
      labelKey,
      minLength,
      multiple,
      options,
    } = this.props;
    const {selected, text} = this.state;

    if (text.length < minLength) {
      return [];
    }

    const callback = Array.isArray(filterBy) ?
      option => defaultFilterBy(
        option,
        text,
        labelKey,
        multiple && !!find(selected, o => isEqual(o, option)),
        {caseSensitive, ignoreDiacritics, fields: filterBy}
      ) :
      option => filterBy(option, text);

    return options.filter(callback);
  },

  blur() {
    this.refs.input.blur();
    this._hideDropdown();
  },

  /**
   * Public method to allow external clearing of the input. Clears both text
   * and selection(s).
   */
  clear() {
    const {activeIndex, activeItem, showMenu} = this.getInitialState();
    const selected = [];
    const text = '';

    this.setState({
      activeIndex,
      activeItem,
      selected,
      showMenu,
      text,
    });

    this.props.onChange(selected);
    this.props.onInputChange(text);
  },

  focus() {
    this.refs.input.focus();
  },

  _renderInput(results) {
    const {
      bsSize,
      disabled,
      labelKey,
      minLength,
      multiple,
      name,
      placeholder,
      renderToken,
    } = this.props;
    const {activeIndex, activeItem, initialItem, selected, text} = this.state;
    const Input = multiple ? TokenizerInput : TypeaheadInput;
    const inputProps = {bsSize, disabled, name, placeholder, renderToken};

    return (
      <Input
        {...inputProps}
        activeIndex={activeIndex}
        activeItem={activeItem}
        hasAux={!!this._renderAux()}
        hintText={getHintText({
          activeItem,
          initialItem,
          labelKey,
          minLength,
          selected,
          text,
        })}
        initialItem={initialItem}
        labelKey={labelKey}
        onAdd={this._handleAddOption}
        onBlur={this._handleBlur}
        onChange={this._handleTextChange}
        onFocus={this._handleFocus}
        onKeyDown={e => this._handleKeydown(results, e)}
        onRemove={this._handleRemoveOption}
        options={results}
        ref="input"
        selected={selected.slice()}
        value={getInputText({activeItem, labelKey, multiple, selected, text})}
      />
    );
  },

  _renderMenu(results, shouldPaginate) {
    const {
      align,
      bodyContainer,
      dropup,
      emptyLabel,
      labelKey,
      maxHeight,
      minLength,
      newSelectionPrefix,
      paginationText,
      renderMenu,
      renderMenuItemChildren,
    } = this.props;

    const {showMenu, text} = this.state;

    const menuProps = {
      align,
      dropup,
      emptyLabel,
      labelKey,
      maxHeight,
      newSelectionPrefix,
      paginationText,
      onPaginate: this._handlePagination,
      paginate: shouldPaginate,
      text,
    };

    const menu = renderMenu ?
      renderMenu(results, menuProps) :
      <TypeaheadMenu
        {...menuProps}
        options={results}
        renderMenuItemChildren={renderMenuItemChildren}
      />;

    return (
      <Overlay
        container={bodyContainer ? document.body : this}
        show={showMenu && text.length >= minLength}
        target={() => this.refs.input}>
        {menu}
      </Overlay>
    );
  },

  _renderAux() {
    const {bsSize, clearButton, disabled, isLoading} = this.props;

    if (isLoading) {
      return <Loader bsSize={bsSize} />;
    }

    if (clearButton && !disabled && this.state.selected.length) {
      return (
        <ClearButton
          bsSize={bsSize}
          className="bootstrap-typeahead-clear-button"
          onClick={this.clear}
        />
      );
    }
  },

  _handleActiveItemChange(activeItem) {
    this.setState({activeItem});
  },

  _handleBlur(e) {
    // Note: Don't hide the menu here, since that interferes with other actions
    // like making a selection by clicking on a menu item.
    this.props.onBlur(e);
  },

  _handleFocus(e) {
    this.props.onFocus(e);
    this.setState({showMenu: true});
  },

  _handleInitialItemChange(initialItem) {
    const currentItem = this.state.initialItem;

    if (!currentItem) {
      this.setState({initialItem});
      return;
    }

    const {labelKey} = this.props;

    // Don't update the initial item if it hasn't changed. For custom items,
    // compare the `labelKey` values since a unique id is generated each time,
    // causing the comparison to always return false otherwise.
    if (
      isEqual(initialItem, currentItem) ||
      (initialItem.customOption &&
       initialItem[labelKey] === currentItem[labelKey])
    ) {
      return;
    }

    this.setState({initialItem});
  },

  _handleTextChange(text) {
    const {activeIndex, activeItem} = this.getInitialState();
    this.setState({
      activeIndex,
      activeItem,
      showMenu: true,
      text,
    });

    this.props.onInputChange(text);
  },

  _handleKeydown(options, e) {
    const {activeItem, showMenu} = this.state;

    switch (e.keyCode) {
      case UP:
      case DOWN:
        // Don't cycle through the options if the menu is hidden.
        if (!showMenu) {
          return;
        }

        let {activeIndex} = this.state;

        // Prevents input cursor from going to the beginning when pressing up.
        e.preventDefault();

        // Increment or decrement index based on user keystroke.
        activeIndex += e.keyCode === UP ? -1 : 1;

        // If we've reached the end, go back to the beginning or vice-versa.
        if (activeIndex === options.length) {
          activeIndex = -1;
        } else if (activeIndex === -2) {
          activeIndex = options.length - 1;
        }

        const newState = {activeIndex};
        if (activeIndex === -1) {
          // Reset the active item if there is no active index.
          newState.activeItem = null;
        }

        this.setState(newState);
        break;
      case ESC:
      case TAB:
        // Prevent closing dialogs.
        e.keyCode === ESC && e.preventDefault();

        this._hideDropdown();
        break;
      case RETURN:
        // Prevent submitting forms.
        e.preventDefault();

        if (showMenu) {
          activeItem && this._handleAddOption(activeItem);
        }
        break;
    }
  },

  _handleAddOption(selectedOption) {
    const {multiple, labelKey, onChange, onInputChange} = this.props;

    let selected;
    let text;

    if (multiple) {
      // If multiple selections are allowed, add the new selection to the
      // existing selections.
      selected = this.state.selected.concat(selectedOption);
      text = '';
    } else {
      // If only a single selection is allowed, replace the existing selection
      // with the new one.
      selected = [selectedOption];
      text = getOptionLabel(selectedOption, labelKey);
    }

    this.setState({
      initialItem: selectedOption,
      selected,
      text,
    });
    this._hideDropdown();

    onChange(selected);
    onInputChange(text);
  },

  _handlePagination(e) {
    let shownResults = this.state.shownResults + this.props.maxResults;

    // Keep the input focused when paginating.
    this.focus();

    this.setState({shownResults});
  },

  _handleRemoveOption(removedOption) {
    let selected = this.state.selected.slice();
    selected = selected.filter(option => !isEqual(option, removedOption));

    // Make sure the input stays focused after the item is removed.
    this.focus();

    this.setState({selected});
    this._hideDropdown();

    this.props.onChange(selected);
  },

  /**
   * From `onClickOutside` HOC.
   */
  handleClickOutside(e) {
    this.state.showMenu && this._hideDropdown();
  },

  _hideDropdown() {
    const {
      activeIndex,
      activeItem,
      showMenu,
      shownResults,
    } = this.getInitialState();

    this.setState({
      activeIndex,
      activeItem,
      showMenu,
      shownResults,
    });
  },
});

export default onClickOutside(Typeahead);

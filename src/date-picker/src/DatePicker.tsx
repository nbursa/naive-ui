import {
  h,
  defineComponent,
  ref,
  Transition,
  computed,
  provide,
  PropType,
  watch,
  withDirectives,
  ExtractPropTypes,
  CSSProperties,
  toRef,
  Ref,
  watchEffect
} from 'vue'
import { VBinder, VTarget, VFollower, FollowerPlacement } from 'vueuc'
import { clickoutside } from 'vdirs'
import { format, getTime, isValid } from 'date-fns'
import { useIsMounted, useMergedState } from 'vooks'
import { happensIn } from 'seemly'
import type { Size as TimePickerSize } from '../../time-picker/src/interface'
import type { DatePickerTheme } from '../styles/light'
import type { InputInst, InputProps } from '../../input'
import { NInput } from '../../input'
import { NBaseIcon } from '../../_internal'
import {
  useFormItem,
  useTheme,
  useConfig,
  useLocale,
  useThemeClass
} from '../../_mixins'
import type { ThemeProps } from '../../_mixins'
import { DateIcon, ToIcon } from '../../_internal/icons'
import { warn, call, useAdjustedTo, createKey, warnOnce } from '../../_utils'
import type { MaybeArray, ExtractPublicPropTypes } from '../../_utils'
import { datePickerLight } from '../styles'
import { strictParse } from './utils'
import {
  uniCalendarValidation,
  dualCalendarValidation
} from './validation-utils'
import { DatePickerType } from './config'
import type {
  OnUpdateValue,
  OnUpdateValueImpl,
  Value,
  PanelRef,
  IsDateDisabled,
  IsTimeDisabled,
  Shortcuts,
  FirstDayOfWeek,
  DefaultTime,
  FormattedValue,
  OnUpdateFormattedValue,
  OnUpdateFormattedValueImpl,
  DatePickerInst
} from './interface'
import { datePickerInjectionKey } from './interface'
import DatetimePanel from './panel/datetime'
import DatetimerangePanel from './panel/datetimerange'
import DatePanel from './panel/date'
import DaterangePanel from './panel/daterange'
import MonthPanel from './panel/month'
import style from './styles/index.cssr'

const datePickerProps = {
  ...(useTheme.props as ThemeProps<DatePickerTheme>),
  to: useAdjustedTo.propTo,
  bordered: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  clearable: Boolean,
  updateValueOnClose: Boolean,
  defaultValue: [Number, Array] as PropType<Value | null>,
  defaultFormattedValue: [String, Array] as PropType<FormattedValue | null>,
  defaultTime: [Number, String, Array] as PropType<DefaultTime>,
  disabled: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  placement: {
    type: String as PropType<FollowerPlacement>,
    default: 'bottom-start'
  },
  value: [Number, Array] as PropType<Value | null>,
  formattedValue: [String, Array] as PropType<FormattedValue | null>,
  size: String as PropType<'small' | 'medium' | 'large'>,
  type: {
    type: String as PropType<DatePickerType>,
    default: 'date'
  },
  valueFormat: String,
  separator: String,
  placeholder: String,
  startPlaceholder: String,
  endPlaceholder: String,
  format: String,
  dateFormat: String,
  timeFormat: String,
  actions: Array as PropType<Array<'clear' | 'confirm' | 'now'>>,
  shortcuts: Object as PropType<Shortcuts>,
  isDateDisabled: Function as PropType<IsDateDisabled>,
  isTimeDisabled: Function as PropType<IsTimeDisabled>,
  show: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  ranges: Object as PropType<Record<string, [number, number]>>,
  firstDayOfWeek: Number as PropType<FirstDayOfWeek>,
  inputReadonly: Boolean,
  closeOnSelect: Boolean,
  'onUpdate:show': [Function, Array] as PropType<
  MaybeArray<(show: boolean) => void>
  >,
  onUpdateShow: [Function, Array] as PropType<
  MaybeArray<(show: boolean) => void>
  >,
  'onUpdate:formattedValue': [Function, Array] as PropType<
  MaybeArray<OnUpdateFormattedValue>
  >,
  onUpdateFormattedValue: [Function, Array] as PropType<
  MaybeArray<OnUpdateFormattedValue>
  >,
  'onUpdate:value': [Function, Array] as PropType<MaybeArray<OnUpdateValue>>,
  onUpdateValue: [Function, Array] as PropType<MaybeArray<OnUpdateValue>>,
  onFocus: [Function, Array] as PropType<(e: FocusEvent) => void>,
  onBlur: [Function, Array] as PropType<(e: FocusEvent) => void>,
  // deprecated
  onChange: [Function, Array] as PropType<MaybeArray<OnUpdateValue>>
} as const

export type DatePickerSetupProps = ExtractPropTypes<typeof datePickerProps>
export type DatePickerProps = ExtractPublicPropTypes<typeof datePickerProps>

export default defineComponent({
  name: 'DatePicker',
  props: datePickerProps,
  setup (props, { slots }) {
    if (__DEV__) {
      watchEffect(() => {
        if (props.onChange !== undefined) {
          warnOnce(
            'data-picker',
            '`on-change` is deprecated, please use `on-update:value` instead.'
          )
        }
      })
    }
    const { localeRef, dateLocaleRef } = useLocale('DatePicker')
    const formItem = useFormItem(props)
    const { mergedSizeRef, mergedDisabledRef, mergedStatusRef } = formItem
    const {
      mergedComponentPropsRef,
      mergedClsPrefixRef,
      mergedBorderedRef,
      namespaceRef,
      inlineThemeDisabled
    } = useConfig(props)
    const panelInstRef = ref<PanelRef | null>(null)
    const triggerElRef = ref<HTMLElement | null>(null)
    const inputInstRef = ref<InputInst | null>(null)
    const uncontrolledShowRef = ref<boolean>(false)
    const controlledShowRef = toRef(props, 'show')
    const mergedShowRef = useMergedState(controlledShowRef, uncontrolledShowRef)
    const dateFnsOptionsRef = computed(() => {
      return {
        locale: dateLocaleRef.value.locale
      }
    })

    const mergedFormatRef = computed(() => {
      const { format } = props
      if (format) return format
      switch (props.type) {
        case 'date':
        case 'daterange':
          return localeRef.value.dateFormat
        case 'datetime':
        case 'datetimerange':
          return localeRef.value.dateTimeFormat
        case 'year':
          return localeRef.value.yearTypeFormat
        case 'month':
          return localeRef.value.monthTypeFormat
        case 'quarter':
          return localeRef.value.quarterFormat
      }
    })
    const mergedValueFormatRef = computed(() => {
      return props.valueFormat ?? mergedFormatRef.value
    })

    function getTimestampValue (value: FormattedValue | null): Value | null {
      if (value === null) return null
      const { value: mergedValueFormat } = mergedValueFormatRef
      const { value: dateFnsOptions } = dateFnsOptionsRef
      if (Array.isArray(value)) {
        return [
          strictParse(
            value[0],
            mergedValueFormat,
            new Date(),
            dateFnsOptions
          ).getTime(),
          strictParse(
            value[1],
            mergedValueFormat,
            new Date(),
            dateFnsOptions
          ).getTime()
        ]
      }
      return strictParse(
        value,
        mergedValueFormat,
        new Date(),
        dateFnsOptions
      ).getTime()
    }

    const { defaultFormattedValue, defaultValue } = props

    const uncontrolledValueRef = ref(
      (defaultFormattedValue !== undefined
        ? getTimestampValue(defaultFormattedValue)
        : defaultValue) ?? null
    )
    const controlledValueRef = computed(() => {
      const { formattedValue } = props
      if (formattedValue !== undefined) {
        return getTimestampValue(formattedValue)
      }
      return props.value
    })
    const mergedValueRef = useMergedState(
      controlledValueRef,
      uncontrolledValueRef
    )
    // We don't change value unless blur or confirm is called
    const pendingValueRef: Ref<Value | null> = ref(null)
    watchEffect(() => {
      pendingValueRef.value = mergedValueRef.value
    })
    const singleInputValueRef = ref('')
    const rangeStartInputValueRef = ref('')
    const rangeEndInputValueRef = ref('')
    const themeRef = useTheme(
      'DatePicker',
      '-date-picker',
      style,
      datePickerLight,
      props,
      mergedClsPrefixRef
    )
    const timePickerSizeRef = computed<TimePickerSize>(() => {
      return (
        mergedComponentPropsRef?.value?.DatePicker?.timePickerSize || 'small'
      )
    })
    const isRangeRef = computed(() => {
      return ['daterange', 'datetimerange'].includes(props.type)
    })
    const localizedPlacehoderRef = computed(() => {
      const { placeholder } = props
      if (placeholder === undefined) {
        const { type } = props
        switch (type) {
          case 'date':
            return localeRef.value.datePlaceholder
          case 'datetime':
            return localeRef.value.datetimePlaceholder
          case 'month':
            return localeRef.value.monthPlaceholder
          case 'year':
            return localeRef.value.yearPlaceholder
          case 'quarter':
            return localeRef.value.quarterPlaceholder
          default:
            return ''
        }
      } else {
        return placeholder
      }
    })
    const localizedStartPlaceholderRef = computed(() => {
      if (props.startPlaceholder === undefined) {
        if (props.type === 'daterange') {
          return localeRef.value.startDatePlaceholder
        } else if (props.type === 'datetimerange') {
          return localeRef.value.startDatetimePlaceholder
        }
        return ''
      } else {
        return props.startPlaceholder
      }
    })
    const localizedEndPlaceholderRef = computed(() => {
      if (props.endPlaceholder === undefined) {
        if (props.type === 'daterange') {
          return localeRef.value.endDatePlaceholder
        } else if (props.type === 'datetimerange') {
          return localeRef.value.endDatetimePlaceholder
        }
        return ''
      } else {
        return props.endPlaceholder
      }
    })
    const mergedActionsRef = computed(() => {
      const { actions, type } = props
      if (actions !== undefined) return actions
      switch (type) {
        case 'date': {
          return ['clear', 'now']
        }
        case 'datetime': {
          return ['clear', 'now', 'confirm']
        }
        case 'daterange': {
          return ['clear', 'confirm']
        }
        case 'datetimerange': {
          return ['clear', 'confirm']
        }
        case 'month': {
          return ['clear', 'now', 'confirm']
        }
        case 'year': {
          return ['clear', 'now']
        }
        case 'quarter': {
          return ['clear', 'now', 'confirm']
        }
        default: {
          warn(
            'data-picker',
            "The type is wrong, n-date-picker's type only supports `date`, `datetime`, `daterange` and `datetimerange`."
          )
          break
        }
      }
    })
    function getFormattedValue (value: Value | null): FormattedValue | null {
      if (value === null) return null
      if (Array.isArray(value)) {
        const { value: mergedValueFormat } = mergedValueFormatRef
        const { value: dateFnsOptions } = dateFnsOptionsRef
        return [
          format(value[0], mergedValueFormat, dateFnsOptions),
          format(value[1], mergedValueFormat, dateFnsOptionsRef.value)
        ]
      } else {
        return format(
          value,
          mergedValueFormatRef.value,
          dateFnsOptionsRef.value
        )
      }
    }
    function doUpdatePendingValue (value: Value | null): void {
      pendingValueRef.value = value
    }
    function doUpdateFormattedValue (
      value: FormattedValue | null,
      timestampValue: Value | null
    ): void {
      const {
        'onUpdate:formattedValue': _onUpdateFormattedValue,
        onUpdateFormattedValue
      } = props
      if (_onUpdateFormattedValue) {
        call(
          _onUpdateFormattedValue as OnUpdateFormattedValueImpl,
          value,
          timestampValue
        )
      }
      if (onUpdateFormattedValue) {
        call(
          onUpdateFormattedValue as OnUpdateFormattedValueImpl,
          value,
          timestampValue
        )
      }
    }
    function doUpdateValue (value: Value | null): void {
      const {
        'onUpdate:value': _onUpdateValue,
        onUpdateValue,
        onChange
      } = props
      const { nTriggerFormChange, nTriggerFormInput } = formItem
      const formattedValue = getFormattedValue(value)
      if (onUpdateValue) {
        call(onUpdateValue as OnUpdateValueImpl, value, formattedValue)
      }
      if (_onUpdateValue) {
        call(_onUpdateValue as OnUpdateValueImpl, value, formattedValue)
      }
      if (onChange) call(onChange as OnUpdateValueImpl, value, formattedValue)
      uncontrolledValueRef.value = value

      doUpdateFormattedValue(formattedValue, value)

      nTriggerFormChange()
      nTriggerFormInput()
    }
    function doFocus (e: FocusEvent): void {
      const { onFocus } = props
      const { nTriggerFormFocus } = formItem
      if (onFocus) call(onFocus, e)
      nTriggerFormFocus()
    }
    function doBlur (e: FocusEvent): void {
      const { onBlur } = props
      const { nTriggerFormBlur } = formItem
      if (onBlur) call(onBlur, e)
      nTriggerFormBlur()
    }
    function doUpdateShow (show: boolean): void {
      const { 'onUpdate:show': _onUpdateShow, onUpdateShow } = props
      if (_onUpdateShow) call(_onUpdateShow, show)
      if (onUpdateShow) call(onUpdateShow, show)
      uncontrolledShowRef.value = show
    }
    function handleKeyDown (e: KeyboardEvent): void {
      if (e.code === 'Escape') {
        closeCalendar({
          returnFocus: true
        })
      }
      // We need to handle the conflict with normal date value input
      // const { value: mergedValue } = mergedValueRef
      // if (props.type === 'date' && !Array.isArray(mergedValue)) {
      //   const nextValue = getDerivedTimeFromKeyboardEvent(mergedValue, e)
      //   doUpdateValue(nextValue)
      // }
    }
    function handleClear (): void {
      doUpdateShow(false)
      inputInstRef.value?.deactivate()
    }
    function handlePanelTabOut (): void {
      closeCalendar({
        returnFocus: true
      })
    }
    function handleClickOutside (e: MouseEvent): void {
      if (
        mergedShowRef.value &&
        !triggerElRef.value?.contains(e.target as Node)
      ) {
        closeCalendar({
          returnFocus: false
        })
      }
    }
    function handlePanelClose (disableUpdateOnClose: boolean): void {
      closeCalendar({
        returnFocus: true,
        disableUpdateOnClose
      })
    }

    // --- Panel update value
    function handlePanelUpdateValue (
      value: Value | null,
      doUpdate: boolean
    ): void {
      if (doUpdate) {
        doUpdateValue(value)
      } else {
        doUpdatePendingValue(value)
      }
    }
    function handlePanelConfirm (): void {
      doUpdateValue(pendingValueRef.value)
    }
    // --- Refresh
    function deriveInputState (): void {
      const { value } = pendingValueRef
      if (isRangeRef.value) {
        if (Array.isArray(value) || value === null) {
          deriveRangeInputState(value)
        }
      } else {
        if (!Array.isArray(value)) {
          deriveSingleInputState(value)
        }
      }
    }
    function deriveSingleInputState (value: number | null): void {
      if (value === null) {
        singleInputValueRef.value = ''
      } else {
        singleInputValueRef.value = format(
          value,
          mergedFormatRef.value,
          dateFnsOptionsRef.value
        )
      }
    }
    function deriveRangeInputState (values: [number, number] | null): void {
      if (values === null) {
        rangeStartInputValueRef.value = ''
        rangeEndInputValueRef.value = ''
      } else {
        const dateFnsOptions = dateFnsOptionsRef.value
        rangeStartInputValueRef.value = format(
          values[0],
          mergedFormatRef.value,
          dateFnsOptions
        )
        rangeEndInputValueRef.value = format(
          values[1],
          mergedFormatRef.value,
          dateFnsOptions
        )
      }
    }
    // --- Input deactivate & blur
    function handleInputActivate (): void {
      if (!mergedShowRef.value) {
        openCalendar()
      }
    }
    function handleInputBlur (e: FocusEvent): void {
      if (!panelInstRef.value?.$el.contains(e.relatedTarget as Node)) {
        doBlur(e)
        deriveInputState()
        closeCalendar({
          returnFocus: false
        })
      }
    }
    function handleInputDeactivate (): void {
      if (mergedDisabledRef.value) return
      deriveInputState()
      closeCalendar({
        returnFocus: false
      })
    }
    // --- Input
    function handleSingleUpdateValue (v: string): void {
      // TODO, fix conflict with clear
      if (v === '') {
        doUpdateValue(null)
        return
      }
      const newSelectedDateTime = strictParse(
        v,
        mergedFormatRef.value,
        new Date(),
        dateFnsOptionsRef.value
      )
      if (isValid(newSelectedDateTime)) {
        doUpdateValue(getTime(newSelectedDateTime))
        deriveInputState()
      } else {
        singleInputValueRef.value = v
      }
    }
    function handleRangeUpdateValue (v: [string, string]): void {
      if (v[0] === '' && v[1] === '') {
        // clear or just delete all the inputs
        doUpdateValue(null)
        return
      }
      const [startTime, endTime] = v
      const newStartTime = strictParse(
        startTime,
        mergedFormatRef.value,
        new Date(),
        dateFnsOptionsRef.value
      )
      const newEndTime = strictParse(
        endTime,
        mergedFormatRef.value,
        new Date(),
        dateFnsOptionsRef.value
      )
      if (isValid(newStartTime) && isValid(newEndTime)) {
        doUpdateValue([getTime(newStartTime), getTime(newEndTime)])
        deriveInputState()
      } else {
        ;[rangeStartInputValueRef.value, rangeEndInputValueRef.value] = v
      }
    }
    // --- Click
    function handleTriggerClick (e: MouseEvent): void {
      if (mergedDisabledRef.value) return
      if (happensIn(e, 'clear')) return
      if (!mergedShowRef.value) {
        openCalendar()
      }
    }
    // --- Focus
    function handleInputFocus (e: FocusEvent): void {
      if (mergedDisabledRef.value) return
      doFocus(e)
    }
    // --- Calendar
    function openCalendar (): void {
      if (mergedDisabledRef.value || mergedShowRef.value) return
      doUpdateShow(true)
    }
    function closeCalendar ({
      returnFocus,
      disableUpdateOnClose
    }: {
      returnFocus: boolean
      disableUpdateOnClose?: boolean
    }): void {
      if (mergedShowRef.value) {
        doUpdateShow(false)
        if (
          props.type !== 'date' &&
          props.updateValueOnClose &&
          !disableUpdateOnClose
        ) {
          handlePanelConfirm()
        }
        if (returnFocus) {
          inputInstRef.value?.focus()
        }
      }
    }
    // If new value is valid, set calendarTime and refresh display strings.
    // If new value is invalid, do nothing.
    watch(pendingValueRef, () => {
      deriveInputState()
    })
    // init
    deriveInputState()

    watch(mergedShowRef, (value) => {
      if (!value) {
        // close & restore original value
        // it won't conflict with props.value change
        // since when prop is passed, it is already
        // up to date.
        pendingValueRef.value = mergedValueRef.value
      }
    })

    // use pending value to do validation
    const uniVaidation = uniCalendarValidation(props, pendingValueRef)
    const dualValidation = dualCalendarValidation(props, pendingValueRef)
    provide(datePickerInjectionKey, {
      mergedClsPrefixRef,
      mergedThemeRef: themeRef,
      timePickerSizeRef,
      localeRef,
      dateLocaleRef,
      firstDayOfWeekRef: toRef(props, 'firstDayOfWeek'),
      isDateDisabledRef: toRef(props, 'isDateDisabled'),
      rangesRef: toRef(props, 'ranges'),
      closeOnSelectRef: toRef(props, 'closeOnSelect'),
      updateValueOnCloseRef: toRef(props, 'updateValueOnClose'),
      ...uniVaidation,
      ...dualValidation,
      datePickerSlots: slots
    })

    const exposedMethods: DatePickerInst = {
      focus: () => {
        inputInstRef.value?.focus()
      },
      blur: () => {
        inputInstRef.value?.blur()
      }
    }

    const triggerCssVarsRef = computed(() => {
      const {
        common: { cubicBezierEaseInOut },
        self: { iconColor, iconColorDisabled }
      } = themeRef.value
      return {
        '--n-bezier': cubicBezierEaseInOut,
        '--n-icon-color': iconColor,
        '--n-icon-color-disabled': iconColorDisabled
      }
    })
    const triggerThemeClassHandle = inlineThemeDisabled
      ? useThemeClass(
        'date-picker-trigger',
        undefined,
        triggerCssVarsRef,
        props
      )
      : undefined

    const cssVarsRef = computed(() => {
      const { type } = props
      const {
        common: { cubicBezierEaseInOut },
        self: {
          calendarTitleFontSize,
          calendarDaysFontSize,
          itemFontSize,
          itemTextColor,
          itemColorDisabled,
          itemColorIncluded,
          itemColorHover,
          itemColorActive,
          itemBorderRadius,
          itemTextColorDisabled,
          itemTextColorActive,
          panelColor,
          panelTextColor,
          arrowColor,
          calendarTitleTextColor,
          panelActionDividerColor,
          panelHeaderDividerColor,
          calendarDaysDividerColor,
          panelBoxShadow,
          panelBorderRadius,
          calendarTitleFontWeight,
          panelExtraFooterPadding,
          panelActionPadding,
          itemSize,
          itemCellWidth,
          itemCellHeight,
          scrollItemWidth,
          scrollItemHeight,
          calendarTitlePadding,
          calendarTitleHeight,
          calendarDaysHeight,
          calendarDaysTextColor,
          arrowSize,
          panelHeaderPadding,
          calendarDividerColor,
          calendarTitleGridTempateColumns,
          iconColor,
          iconColorDisabled,
          scrollItemBorderRadius,
          calendarTitleColorHover,
          [createKey('calendarLeftPadding', type)]: calendarLeftPadding,
          [createKey('calendarRightPadding', type)]: calendarRightPadding
        }
      } = themeRef.value
      return {
        '--n-bezier': cubicBezierEaseInOut,

        '--n-panel-border-radius': panelBorderRadius,
        '--n-panel-color': panelColor,
        '--n-panel-box-shadow': panelBoxShadow,
        '--n-panel-text-color': panelTextColor,

        // panel header
        '--n-panel-header-padding': panelHeaderPadding,
        '--n-panel-header-divider-color': panelHeaderDividerColor,

        // panel calendar
        '--n-calendar-left-padding': calendarLeftPadding,
        '--n-calendar-right-padding': calendarRightPadding,
        '--n-calendar-title-color-hover': calendarTitleColorHover,
        '--n-calendar-title-height': calendarTitleHeight,
        '--n-calendar-title-padding': calendarTitlePadding,
        '--n-calendar-title-font-size': calendarTitleFontSize,
        '--n-calendar-title-font-weight': calendarTitleFontWeight,
        '--n-calendar-title-text-color': calendarTitleTextColor,
        '--n-calendar-title-grid-template-columns':
          calendarTitleGridTempateColumns,
        '--n-calendar-days-height': calendarDaysHeight,
        '--n-calendar-days-divider-color': calendarDaysDividerColor,
        '--n-calendar-days-font-size': calendarDaysFontSize,
        '--n-calendar-days-text-color': calendarDaysTextColor,
        '--n-calendar-divider-color': calendarDividerColor,

        // panel action
        '--n-panel-action-padding': panelActionPadding,
        '--n-panel-extra-footer-padding': panelExtraFooterPadding,
        '--n-panel-action-divider-color': panelActionDividerColor,

        // panel item
        '--n-item-font-size': itemFontSize,
        '--n-item-border-radius': itemBorderRadius,
        '--n-item-size': itemSize,
        '--n-item-cell-width': itemCellWidth,
        '--n-item-cell-height': itemCellHeight,
        '--n-item-text-color': itemTextColor,
        '--n-item-color-included': itemColorIncluded,
        '--n-item-color-disabled': itemColorDisabled,
        '--n-item-color-hover': itemColorHover,
        '--n-item-color-active': itemColorActive,
        '--n-item-text-color-disabled': itemTextColorDisabled,
        '--n-item-text-color-active': itemTextColorActive,

        // scroll item
        '--n-scroll-item-width': scrollItemWidth,
        '--n-scroll-item-height': scrollItemHeight,
        '--n-scroll-item-border-radius': scrollItemBorderRadius,

        // panel arrow
        '--n-arrow-size': arrowSize,
        '--n-arrow-color': arrowColor,

        // icon in trigger
        '--n-icon-color': iconColor,
        '--n-icon-color-disabled': iconColorDisabled
      }
    })
    const themeClassHandle = inlineThemeDisabled
      ? useThemeClass('date-picker', undefined, cssVarsRef, props)
      : undefined

    return {
      ...exposedMethods,
      mergedStatus: mergedStatusRef,
      mergedClsPrefix: mergedClsPrefixRef,
      mergedBordered: mergedBorderedRef,
      namespace: namespaceRef,
      uncontrolledValue: uncontrolledValueRef,
      pendingValue: pendingValueRef,
      panelInstRef,
      triggerElRef,
      inputInstRef,
      isMounted: useIsMounted(),
      displayTime: singleInputValueRef,
      displayStartTime: rangeStartInputValueRef,
      displayEndTime: rangeEndInputValueRef,
      mergedShow: mergedShowRef,
      adjustedTo: useAdjustedTo(props),
      isRange: isRangeRef,
      localizedStartPlaceholder: localizedStartPlaceholderRef,
      localizedEndPlaceholder: localizedEndPlaceholderRef,
      mergedSize: mergedSizeRef,
      mergedDisabled: mergedDisabledRef,
      localizedPlacehoder: localizedPlacehoderRef,
      isValueInvalid: uniVaidation.isValueInvalidRef,
      isStartValueInvalid: dualValidation.isStartValueInvalidRef,
      isEndValueInvalid: dualValidation.isEndValueInvalidRef,
      handleClickOutside,
      handleKeyDown,
      handleClear,
      handleTriggerClick,
      handleInputActivate,
      handleInputDeactivate,
      handleInputFocus,
      handleInputBlur,
      handlePanelTabOut,
      handlePanelClose,
      handleRangeUpdateValue,
      handleSingleUpdateValue,
      handlePanelUpdateValue,
      handlePanelConfirm,
      mergedTheme: themeRef,
      actions: mergedActionsRef,
      triggerCssVars: inlineThemeDisabled ? undefined : triggerCssVarsRef,
      triggerThemeClass: triggerThemeClassHandle?.themeClass,
      triggerOnRender: triggerThemeClassHandle?.onRender,
      cssVars: inlineThemeDisabled ? undefined : cssVarsRef,
      themeClass: themeClassHandle?.themeClass,
      onRender: themeClassHandle?.onRender
    }
  },
  render () {
    const { clearable, triggerOnRender } = this
    triggerOnRender?.()
    const commonInputProps: InputProps = {
      bordered: this.mergedBordered,
      size: this.mergedSize,
      passivelyActivated: true,
      disabled: this.mergedDisabled,
      readonly: this.inputReadonly || this.mergedDisabled,
      clearable,
      onClear: this.handleClear,
      onClick: this.handleTriggerClick,
      onActivate: this.handleInputActivate,
      onDeactivate: this.handleInputDeactivate,
      onFocus: this.handleInputFocus,
      onBlur: this.handleInputBlur
    }
    const commonPanelProps = {
      onUpdateValue: this.handlePanelUpdateValue,
      onTabOut: this.handlePanelTabOut,
      onClose: this.handlePanelClose,
      onKeydown: this.handleKeyDown,
      onConfirm: this.handlePanelConfirm,
      ref: 'panelInstRef',
      value: this.pendingValue,
      active: this.mergedShow,
      actions: this.actions,
      shortcuts: this.shortcuts,
      style: this.cssVars as CSSProperties,
      defaultTime: this.defaultTime,
      themeClass: this.themeClass,
      onRender: this.onRender
    }
    const { mergedClsPrefix } = this
    return (
      <div
        ref="triggerElRef"
        class={[
          `${mergedClsPrefix}-date-picker`,
          this.mergedDisabled && `${mergedClsPrefix}-date-picker--disabled`,
          this.isRange && `${mergedClsPrefix}-date-picker--range`,
          this.triggerThemeClass
        ]}
        style={this.triggerCssVars as CSSProperties}
        onKeydown={this.handleKeyDown}
      >
        <VBinder>
          {{
            default: () => [
              <VTarget>
                {{
                  default: () =>
                    this.isRange ? (
                      <NInput
                        ref="inputInstRef"
                        status={this.mergedStatus}
                        value={[this.displayStartTime, this.displayEndTime]}
                        placeholder={[
                          this.localizedStartPlaceholder,
                          this.localizedEndPlaceholder
                        ]}
                        textDecoration={[
                          this.isStartValueInvalid ? 'line-through' : '',
                          this.isEndValueInvalid ? 'line-through' : ''
                        ]}
                        pair
                        onUpdateValue={this.handleRangeUpdateValue}
                        theme={this.mergedTheme.peers.Input}
                        themeOverrides={this.mergedTheme.peerOverrides.Input}
                        internalForceFocus={this.mergedShow}
                        internalDeactivateOnEnter
                        {...commonInputProps}
                      >
                        {{
                          separator: () =>
                            this.separator === undefined ? (
                              <NBaseIcon
                                clsPrefix={mergedClsPrefix}
                                class={`${mergedClsPrefix}-date-picker-icon`}
                              >
                                {{ default: () => <ToIcon /> }}
                              </NBaseIcon>
                            ) : (
                              this.separator
                            ),
                          [clearable ? 'clear' : 'suffix']: () => (
                            <NBaseIcon
                              clsPrefix={mergedClsPrefix}
                              class={`${mergedClsPrefix}-date-picker-icon`}
                            >
                              {{ default: () => <DateIcon /> }}
                            </NBaseIcon>
                          )
                        }}
                      </NInput>
                    ) : (
                      <NInput
                        ref="inputInstRef"
                        status={this.mergedStatus}
                        value={this.displayTime}
                        placeholder={this.localizedPlacehoder}
                        textDecoration={
                          this.isValueInvalid && !this.isRange
                            ? 'line-through'
                            : ''
                        }
                        onUpdateValue={this.handleSingleUpdateValue}
                        theme={this.mergedTheme.peers.Input}
                        themeOverrides={this.mergedTheme.peerOverrides.Input}
                        internalForceFocus={this.mergedShow}
                        internalDeactivateOnEnter
                        {...commonInputProps}
                      >
                        {{
                          [clearable ? 'clear' : 'suffix']: () => (
                            <NBaseIcon
                              clsPrefix={mergedClsPrefix}
                              class={`${mergedClsPrefix}-date-picker-icon`}
                            >
                              {{ default: () => <DateIcon /> }}
                            </NBaseIcon>
                          )
                        }}
                      </NInput>
                    )
                }}
              </VTarget>,
              <VFollower
                show={this.mergedShow}
                containerClass={this.namespace}
                to={this.adjustedTo}
                teleportDisabled={this.adjustedTo === useAdjustedTo.tdkey}
                placement={this.placement}
              >
                {{
                  default: () => (
                    <Transition
                      name="fade-in-scale-up-transition"
                      appear={this.isMounted}
                    >
                      {{
                        default: () =>
                          this.mergedShow
                            ? withDirectives(
                              this.type === 'datetime' ? (
                                  <DatetimePanel {...commonPanelProps} />
                              ) : this.type === 'daterange' ? (
                                  <DaterangePanel {...commonPanelProps} />
                              ) : this.type === 'datetimerange' ? (
                                  <DatetimerangePanel {...commonPanelProps} />
                              ) : this.type === 'month' ? (
                                  <MonthPanel
                                    {...commonPanelProps}
                                    type="month"
                                    key="month"
                                  />
                              ) : this.type === 'year' ? (
                                  <MonthPanel
                                    {...commonPanelProps}
                                    type="year"
                                    key="year"
                                  />
                              ) : this.type === 'quarter' ? (
                                  <MonthPanel
                                    {...commonPanelProps}
                                    type="quarter"
                                    key="quarter"
                                  />
                              ) : (
                                  <DatePanel {...commonPanelProps} />
                              ),
                              [[clickoutside, this.handleClickOutside]]
                            )
                            : null
                      }}
                    </Transition>
                  )
                }}
              </VFollower>
            ]
          }}
        </VBinder>
      </div>
    )
  }
})

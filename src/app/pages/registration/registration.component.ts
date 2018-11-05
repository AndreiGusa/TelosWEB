import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NotificationsService } from 'angular2-notifications';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import "rxjs/add/operator/catch";
import 'rxjs/add/operator/finally';

@Component({
  selector: 'registration-page',
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css']
})
export class RegistrationPageComponent implements OnInit {
  dataSent: any;
  registerFGroup: FormGroup;
  protocols: any[];
  isLoading: boolean = false;

  //regex
  readonly EMAIL_REGEX = new RegExp(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,6}$/i);
  readonly PRODUCER_NAME_REGEX = new RegExp(/^[a-z1-5_\-]+$/);
  readonly URL_REGEX_WITH_PORT = new RegExp(/^(((?!-))(xn--|_{1,1})?[a-z0-9-]{0,61}[a-z0-9]{1,1}\.)*(xn--)?([a-z0-9\-]{1,61}|[a-z0-9-]{1,30}\.[a-z]{2,}):[0-9]+$/);
  readonly URL_REGEX = new RegExp(/^(((?!-))(xn--|_{1,1})?[a-z0-9-]{0,61}[a-z0-9]{1,1}\.)*(xn--)?([a-z0-9\-]{1,61}|[a-z0-9-]{1,30}\.[a-z]{2,})$/);
  readonly IP_REGEX = new RegExp(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]):[0-9]+$/g);

  readonly INIT_FORM_VALUE: any;

  constructor(
    private route: ActivatedRoute, 
    protected http: HttpClient, 
    private notifications: NotificationsService
  ) {
    this.protocols = [{
      label: 'HTTPS',
      value: 'https',
      field: 'httpsServerAddress'
    }, {
      label: 'HTTP',
      value: 'http',
      field: 'httpServerAddress'
    }];

    this.INIT_FORM_VALUE = {
      name: '',
      organization: '',
      protocol: this.protocols[0].value,
      serverIPAddress: '',
      p2pServerAddress: '',
      producerPublicKey: '',
      telegramChannel: '',
      email: '',
      url: ''
    }
  }

  send() {
    if (!this.registerFGroup.valid) return;
    this.isLoading = true;

    const value = Object.assign({}, this.registerFGroup.value);

    let dataToSend = {
      producer: {
        name: value.name,
        organization: value.organization,
        p2pServerAddress: value.p2pServerAddress,
        producerPublicKey: value.producerPublicKey,
        telegramChannel: value.telegramChannel,
        email: value.email,
        url: value.url,
      }
    };
    this.setServerAddress(dataToSend.producer, value);

    this.registerProducerNode(dataToSend)
      .finally(() => this.isLoading = false)
      .subscribe(
        data => {
          this.dataSent = Object.assign({}, dataToSend.producer);
          // this.registerFGroup.reset(this.INIT_FORM_VALUE);
          this.notifications.success('Producer Registered');
        },
        error => {
          const message = error.data.what ? error.data.what : error.message;
          this.notifications.error(message);
        }
      );
  }

  
  ngOnInit() {
    this.registerFGroup = this.newRegisterForm();
    this.registerFGroup.patchValue(this.INIT_FORM_VALUE);
  }

  registerProducerNode(data) {
    return this.http.post(`/api/v1/teclos`, data)
      .catch(err => {
        console.log(err);
        return Observable.throw(err.error);
      });
  }

  private newRegisterForm() {
    return new FormGroup({
      name: new FormControl('', [
        Validators.required,
        Validators.minLength(12),
        Validators.maxLength(12),
        Validators.pattern(this.PRODUCER_NAME_REGEX)
      ]),
      organization: new FormControl(''),
      protocol: new FormControl('', [ Validators.required ]),
      serverIPAddress: new FormControl('', [
        Validators.required,
      ], this.validateAddress.bind(this)),
      p2pServerAddress: new FormControl('', [
        Validators.required
      ], this.validateAddress.bind(this)),
      producerPublicKey: new FormControl('', [
        Validators.required
      ], this.getProducerPublicKeyValidation.bind(this)),
      telegramChannel: new FormControl(''),
      email: new FormControl('', [
        Validators.required,
        Validators.pattern(this.EMAIL_REGEX)
      ]),
      url: new FormControl('', [
        Validators.required
      ], this.getUrlValidationState.bind(this)),
    });
  }

  private validateAddress(form: FormControl) {
    let errors: any = null;
    let value = form.value;

    if (value.indexOf('http://') === 0)
      value = value.slice(7);
    else if (value.indexOf('https://') === 0)
      value = value.slice(8);

    if (value &&
        !this.hasValidPortNumber(value) &&
          (!this.URL_REGEX_WITH_PORT.test(value) ||
          !this.IP_REGEX.test(value))
        ) {
      if (!errors)
        errors = {};
      errors.patterns = true;
    }

    return Observable.of(errors);
  }

  private hasValidPortNumber(validationTarget) {
    const portNumber = validationTarget.slice(validationTarget.lastIndexOf(':') + 1);

    if (!portNumber) return false;
    if (isNaN(portNumber)) return false;
    if (parseInt(portNumber) > 65535) return false;
    if (parseInt(portNumber) < 0) return false;

    return true;
  }

  private getProducerPublicKeyValidation(form: FormControl) {
    let errors: any = null;
    const value = form.value;
    const length = value.length;
    const regex = new RegExp(/^[a-zA-Z0-9_\-]+$/);

    if (value.slice(0, 3) != 'EOS' ||
        length != 53 ||
        !regex.test(value)) {
      if (!errors)
        errors = {};
      errors.patterns = true;
    }

    return Observable.of(errors);
  }

  private getUrlValidationState(form: FormControl) {
    let errors: any = null;
    let value = form.value;

      if (value.indexOf('http://') === 0)
        value = value.slice(7);
      else if (value.indexOf('https://') === 0)
        value = value.slice(8);

      if (!this.URL_REGEX.test(value) && !this.URL_REGEX_WITH_PORT.test(value)) {
        if (!errors)
          errors = {};
        errors.patterns = true;
      }

      return Observable.of(errors);
  }

  private setServerAddress(dataToSend, formValue) {
    this.protocols.forEach((protocol) => {
      if (protocol.value === formValue.protocol) {
        dataToSend[protocol.field] = this.separateProtocol(formValue.serverIPAddress);
        return;
      }
    });
  }

  private separateProtocol(value) {
    if (value.indexOf('http://') === 0)
      return value.slice(7);
    else if (value.indexOf('https://') === 0)
      return value.slice(8);
    else return value;
  }
}
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NotificationsService } from 'angular2-notifications';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import "rxjs/add/operator/catch";
import 'rxjs/add/operator/finally';

@Component({
  selector: 'account-creation-page',
  templateUrl: './account-creation.component.html',
  styleUrls: ['./account-creation.component.css']
})
export class AccountCreationPageComponent implements OnInit {
  createAccountFGroup: FormGroup;
  isLoading: boolean = false;

  //regex
  readonly PRODUCER_NAME_REGEX = new RegExp(/^[a-z1-5_\-]+$/);

  constructor(
    protected http: HttpClient, 
    private notifications: NotificationsService
  ) { }

  send() {
    if (!this.createAccountFGroup.valid) return;
    this.isLoading = true;

    const dataToSend = Object.assign({}, this.createAccountFGroup.value);

    this.createAccount(dataToSend)
      .finally(() => this.isLoading = false)
      .subscribe(
        data => this.notifications.success('Account Created'),
        error => {
          const message =  error.data.what ? error.data.what : error.message;
          this.notifications.error(message);
        }
      );
  }

  
  ngOnInit() {
    this.createAccountFGroup = this.newAccountCreationForm();
  }

  createAccount(data) {
    return this.http.post(`/api/v1/teclos/newaccount`, data)
      .catch(err => {
        console.log(err);
        return Observable.throw(err.error);
      });
  }

  private newAccountCreationForm() {
    return new FormGroup({
      name: new FormControl('', [
        Validators.required,
        Validators.minLength(12),
        Validators.maxLength(12),
        Validators.pattern(this.PRODUCER_NAME_REGEX)
      ]),
      publicKey: new FormControl('', [
        Validators.required
      ], this.getPublicKeyValidation.bind(this))
    });
  }

  private getPublicKeyValidation(form: FormControl) {
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
}
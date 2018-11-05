import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NotificationsService } from 'angular2-notifications';
import * as ecc from 'eosjs-ecc';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  privateKey: String;
  message: String;

  constructor(private http:HttpClient, private notifications:NotificationsService) {
    ecc.config.address_prefix = 'EOS';
  }

  ngOnInit() {
    this.getMessage(); 
  }

  getMessage(){
    this.http.get("/admin/v1/news").subscribe(
      (response:any) => {
        this.message = response.message;
      },
      (error:any) => {
        this.notifications.error(error);
      }
    );
  }

  postMessage(data){
    this.http.post("/admin/v1/news", data).subscribe(
      (response:any) => {
        this.message = response.message;
        this.notifications.info("Done!");
      },
      (error:any) => {
        this.notifications.error(error.error);
      }
    );
  }

  update(){
    const signature = ecc.sign(this.message, this.privateKey);
    this.postMessage({
      signature,
      message: this.message
    });
  }
}
